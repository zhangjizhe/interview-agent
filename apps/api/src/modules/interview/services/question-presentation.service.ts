import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, QuestionPresentationState } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../infra/prisma/prisma.service';

type Transaction = Prisma.TransactionClient;
export interface PresentedQuestion {
  presentationId: string;
  taskId: string;
  messageId: string;
  question: string;
  state: QuestionPresentationState;
}

/** Durable task/message boundary. No provider calls and no automatic claim expiry. */
@Injectable()
export class QuestionPresentationService {
  constructor(private readonly prisma: PrismaService) {}

  private requireIds(...ids: string[]): void {
    if (ids.some(id => typeof id !== 'string' || !id.trim() || id.length > 256)) throw new NotFoundException('Question or interview not found');
  }

  private requireToken(token: string): void {
    if (typeof token !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(token)) {
      throw new ConflictException('A valid answer claim attempt is required');
    }
  }

  private view(row: { id: string; taskId: string; messageId: string; question: string; state: QuestionPresentationState }): PresentedQuestion {
    return { presentationId: row.id, taskId: row.taskId, messageId: row.messageId, question: row.question, state: row.state };
  }

  private async locked<T>(interviewId: string, userId: string, work: (tx: Transaction, organizationId: string) => Promise<T>): Promise<T> {
    this.requireIds(interviewId, userId);
    return this.prisma.$transaction(async tx => {
      const interview = await tx.interview.findFirst({ where: { id: interviewId, userId }, select: { organizationId: true } });
      if (!interview) throw new NotFoundException('Interview not found');
      // A guarded no-op update acquires the parent row lock without raw SQL (tenant
      // requests prohibit raw queries). Only short database work runs under it.
      const lock = await tx.interview.updateMany({
        where: { id: interviewId, userId, organizationId: interview.organizationId, status: 'IN_PROGRESS', resumeConfirmed: true },
        data: { resumeConfirmed: true },
      });
      if (lock.count !== 1) throw new ConflictException('Interview is not ready for an answer');
      return work(tx, interview.organizationId);
    });
  }

  /** Queue initialization must finish before calling this. Creation and message
   * publication are atomic; concurrent callers return the same persisted receipt. */
  async presentCurrent(interviewId: string, userId: string): Promise<PresentedQuestion | null> {
    return this.locked(interviewId, userId, async (tx, organizationId) => {
      const unresolved = await tx.interviewQuestionPresentation.findFirst({
        where: { interviewId, organizationId, state: { in: ['OPEN', 'PROCESSING', 'UNKNOWN'] } },
        orderBy: { createdAt: 'asc' },
      });
      if (unresolved) return this.view(unresolved);
      const task = await tx.interviewTask.findFirst({
        where: { interviewId, organizationId, status: 'PENDING' },
        orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      });
      if (!task) return null;
      const existing = await tx.interviewQuestionPresentation.findUnique({ where: { taskId: task.id } });
      if (existing) {
        if (existing.interviewId !== interviewId || existing.organizationId !== organizationId || existing.state === 'ANSWERED') {
          throw new ConflictException('Question presentation is inconsistent');
        }
        return this.view(existing);
      }
      if (!task.question.trim()) throw new ConflictException('Question is unavailable');
      const message = await tx.message.create({
        data: { interviewId, organizationId, role: 'assistant', content: task.question },
      });
      const row = await tx.interviewQuestionPresentation.create({
        data: { interviewId, organizationId, taskId: task.id, messageId: message.id, question: task.question },
      });
      return this.view(row);
    });
  }

  /** Only CLAIMED permits a new provider dispatch. All replay states are read-only. */
  async claimAnswer(interviewId: string, userId: string, presentationId: string, messageId: string): Promise<{
    state: 'CLAIMED' | 'PROCESSING' | 'UNKNOWN' | 'ANSWERED'; taskId: string; claimToken?: string;
  }> {
    this.requireIds(presentationId, messageId);
    return this.locked(interviewId, userId, async (tx, organizationId) => {
      const receipt = await tx.interviewQuestionPresentation.findFirst({ where: { id: presentationId, interviewId, organizationId } });
      const message = await tx.message.findFirst({ where: { id: messageId, interviewId, organizationId, role: 'user' } });
      if (!receipt || !message) throw new NotFoundException('Question or answer not found');
      if (!message.content.trim()) throw new ConflictException('The answer is empty');
      if (receipt.claimMessageId === messageId && receipt.state !== 'OPEN') {
        return { state: receipt.state, taskId: receipt.taskId };
      }
      if (receipt.state !== 'OPEN' || receipt.claimMessageId) throw new ConflictException('This question already has an answer claim');
      const unresolved = await tx.interviewQuestionPresentation.count({
        where: { interviewId, organizationId, state: { in: ['PROCESSING', 'UNKNOWN'] } },
      });
      if (unresolved) throw new ConflictException('An answer result is still pending or unknown');
      const task = await tx.interviewTask.findFirst({
        where: { id: receipt.taskId, interviewId, organizationId, status: 'PENDING' },
      });
      if (!task || task.id !== receipt.taskId || task.question !== receipt.question) throw new ConflictException('The presented question is no longer current');
      const claimToken = randomUUID();
      const claimed = await tx.interviewQuestionPresentation.updateMany({
        where: { id: receipt.id, interviewId, organizationId, state: 'OPEN', claimMessageId: null },
        data: { state: 'PROCESSING', claimMessageId: messageId, claimToken, claimedAt: new Date() },
      });
      if (claimed.count !== 1) throw new ConflictException('The question was claimed concurrently');
      return { state: 'CLAIMED', taskId: receipt.taskId, claimToken };
    });
  }

  /** Call only when dispatch demonstrably did not start, never after an unknown
   * provider outcome. The caller separately handles its unanswered user message. */
  async releaseBeforeDispatch(interviewId: string, userId: string, presentationId: string, messageId: string, claimToken: string): Promise<void> {
    this.requireIds(presentationId, messageId); this.requireToken(claimToken);
    await this.locked(interviewId, userId, async (tx, organizationId) => {
      const count = await tx.interviewAnswer.count({ where: { interviewId, organizationId, messageId } });
      if (count) throw new ConflictException('A persisted answer cannot be released');
      const changed = await tx.interviewQuestionPresentation.updateMany({
        where: { id: presentationId, interviewId, organizationId, state: 'PROCESSING', claimMessageId: messageId, claimToken },
        data: { state: 'OPEN', claimMessageId: null, claimToken: null, claimedAt: null },
      });
      if (changed.count !== 1) throw new ConflictException('Answer claim cannot be released');
    });
  }

  async markUnknown(interviewId: string, userId: string, presentationId: string, messageId: string, claimToken: string): Promise<void> {
    this.requireIds(presentationId, messageId); this.requireToken(claimToken);
    await this.locked(interviewId, userId, async (tx, organizationId) => {
      const changed = await tx.interviewQuestionPresentation.updateMany({
        where: { id: presentationId, interviewId, organizationId, state: 'PROCESSING', claimMessageId: messageId, claimToken },
        data: { state: 'UNKNOWN' },
      });
      if (changed.count !== 1) throw new ConflictException('Answer claim is no longer processing');
    });
  }

  async finishAnswer(interviewId: string, userId: string, presentationId: string, messageId: string, claimToken: string): Promise<void> {
    this.requireIds(presentationId, messageId); this.requireToken(claimToken);
    await this.locked(interviewId, userId, async (tx, organizationId) => {
      const receipt = await tx.interviewQuestionPresentation.findFirst({
        where: { id: presentationId, interviewId, organizationId, claimMessageId: messageId, claimToken },
      });
      if (!receipt) throw new NotFoundException('Answer claim not found');
      if (receipt.state === 'ANSWERED') return;
      if (receipt.state !== 'PROCESSING') throw new ConflictException('An unknown answer requires explicit reconciliation');
      const answer = await tx.interviewAnswer.findFirst({
        where: { interviewId, organizationId, messageId, question: { sourceTaskId: receipt.taskId, interviewId, organizationId } },
        include: { message: true, question: true, answerHistories: { where: { interviewId, organizationId } } },
      });
      const task = await tx.interviewTask.findFirst({ where: { id: receipt.taskId, interviewId, organizationId, status: 'COMPLETED' } });
      if (!answer || answer.answerHistories.length !== 1 || !task
        || task.question !== receipt.question || answer.question.question !== receipt.question
        || answer.content !== answer.message.content
        || answer.answerHistories[0].questionId !== answer.questionId
        || answer.answerHistories[0].question !== receipt.question
        || answer.answerHistories[0].answer !== answer.content) throw new ConflictException('The scored answer is not durably confirmed');
      await tx.interviewQuestionPresentation.update({
        where: { id: receipt.id }, data: { state: 'ANSWERED', resolvedAt: new Date() },
      });
    });
  }
}
