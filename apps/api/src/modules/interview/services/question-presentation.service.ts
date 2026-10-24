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

  private async locked<T>(interviewId: string, userId: string, work: (tx: Transaction, organizationId: string) => Promise<T>, confirming = false): Promise<T> {
    this.requireIds(interviewId, userId);
    return this.prisma.$transaction(async tx => {
      const interview = await tx.interview.findFirst({ where: { id: interviewId, userId }, select: { organizationId: true } });
      if (!interview) throw new NotFoundException('Interview not found');
      // A guarded no-op update acquires the parent row lock without raw SQL (tenant
      // requests prohibit raw queries). Only short database work runs under it.
      const lock = await tx.interview.updateMany({
        where: { id: interviewId, userId, organizationId: interview.organizationId, status: 'IN_PROGRESS', ...(confirming ? {} : { resumeConfirmed: true }) },
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
      return this.presentInTransaction(tx, interviewId, organizationId);
    });
  }

  /** A read never initializes a queue, creates messages, or calls a provider. */
  async readCurrent(interviewId: string, userId: string): Promise<PresentedQuestion | null> {
    this.requireIds(interviewId, userId);
    const interview = await this.prisma.interview.findFirst({ where: { id: interviewId, userId }, select: { organizationId: true, status: true, resumeConfirmed: true } });
    if (!interview) throw new NotFoundException('Interview not found');
    if (interview.status !== 'IN_PROGRESS' || !interview.resumeConfirmed) return null;
    const receipt = await this.prisma.interviewQuestionPresentation.findFirst({
      where: { interviewId, organizationId: interview.organizationId, state: { in: ['OPEN', 'PROCESSING', 'UNKNOWN'] } },
    });
    return receipt ? this.view(receipt) : null;
  }

  /** The bank read occurs before this method. Parent lock and all authoritative
   * writes use one transaction, including the first confirmation and task queue. */
  async confirmPrepared(
    interviewId: string,
    userId: string,
    snapshot: { position: string; level: string; mode: string; targetJobId: string | null; targetJobProfileVersion: number | null; practiceSkillId: string | null },
    prepared: Prisma.InterviewTaskCreateManyInput[],
  ): Promise<PresentedQuestion | null> {
    return this.locked(interviewId, userId, async (tx, organizationId) => {
      const current = await tx.interview.findFirstOrThrow({ where: { id: interviewId, userId, organizationId } });
      for (const key of ['position', 'level', 'mode', 'targetJobId', 'targetJobProfileVersion', 'practiceSkillId'] as const) {
        if (current[key] !== snapshot[key]) throw new ConflictException('Interview context changed; reload before confirming');
      }
      if (current.targetJobId) {
        const job = await tx.targetJob.updateMany({
          where: { id: current.targetJobId, userId, organizationId, isActive: true, profileVersion: current.targetJobProfileVersion ?? -1 },
          data: { isActive: true },
        });
        if (job.count !== 1) throw new ConflictException('The target job changed; start a new interview with the current job');
      }
      const existingReceipt = await tx.interviewQuestionPresentation.findFirst({
        where: { interviewId, organizationId, state: { in: ['OPEN', 'PROCESSING', 'UNKNOWN'] } },
      });
      const tasks = await tx.interviewTask.findMany({ where: { interviewId, organizationId } });
      if (tasks.length === 0) {
        if (prepared.length === 0 || prepared.some(task => !task.question.trim())) throw new ConflictException('No question is prepared');
        await tx.interviewTask.createMany({ data: prepared.map(task => ({ ...task, interviewId, organizationId })) });
      } else {
        // Old completed tasks remain historical. A pending task must carry the
        // same pinned context before it can acquire a new presentation receipt.
        for (const task of tasks.filter(task => task.status === 'PENDING' || task.id === existingReceipt?.taskId)) {
          let context: any;
          try { context = typeof task.context === 'string' ? JSON.parse(task.context) : task.context; } catch { context = null; }
          if (!context || context.position !== current.position || context.level !== current.level
            || (context.mode || 'FULL_SIMULATION') !== current.mode
            || (context.targetJobId || null) !== current.targetJobId
            || (context.targetJobProfileVersion || null) !== current.targetJobProfileVersion
            || (context.practiceSkillId || null) !== current.practiceSkillId) {
            throw new ConflictException('The existing question context could not be verified');
          }
        }
      }
      if (existingReceipt) return this.view(existingReceipt);
      return this.presentInTransaction(tx, interviewId, organizationId);
    }, true);
  }

  private async presentInTransaction(tx: Transaction, interviewId: string, organizationId: string): Promise<PresentedQuestion | null> {
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
  }

  /** Ending shares the claim lock. Ended means input is closed; it does not mean
   * a report exists. No automatic retry of a missing/unknown report is authorized. */
  async reserveEnd(interviewId: string, userId: string) {
    this.requireIds(interviewId, userId);
    return this.prisma.$transaction(async tx => {
      const owner = await tx.interview.findFirst({ where: { id: interviewId, userId }, select: { organizationId: true } });
      if (!owner) throw new NotFoundException('Interview not found');
      const locked = await tx.interview.updateMany({
        where: { id: interviewId, userId, organizationId: owner.organizationId, status: 'IN_PROGRESS' },
        data: { status: 'IN_PROGRESS' },
      });
      const interview = await tx.interview.findFirstOrThrow({
        where: { id: interviewId, userId, organizationId: owner.organizationId },
        include: { messages: { orderBy: { createdAt: 'asc' } }, report: true },
      });
      if (locked.count !== 1) {
        if (interview.status === 'COMPLETED') return { state: 'ALREADY_ENDED' as const, interview };
        throw new ConflictException('Interview is not active');
      }
      const unresolved = await tx.interviewQuestionPresentation.count({
        where: { interviewId, organizationId: owner.organizationId, state: { in: ['PROCESSING', 'UNKNOWN'] } },
      });
      const inFlightFinal = await tx.evaluationRun.count({
        where: { interviewId, organizationId: owner.organizationId, mode: 'FINAL', status: { in: ['PENDING', 'RUNNING'] } },
      });
      if (unresolved || inFlightFinal) throw new ConflictException('An answer or report is still processing or requires verification');
      const answers = await tx.interviewAnswer.count({ where: { interviewId, organizationId: owner.organizationId } });
      if (!answers) {
        const presentations = await tx.interviewQuestionPresentation.findMany({ where: { interviewId, organizationId: owner.organizationId }, select: { messageId: true } });
        const presentedMessages = new Set(presentations.map(row => row.messageId));
        const onlyPresentedQuestions = interview.messages.every(message => message.role === 'assistant' && presentedMessages.has(message.id));
        if (!onlyPresentedQuestions || interview.report) throw new ConflictException('Historical messages without scored answers require verification');
        await tx.interview.delete({ where: { id: interviewId } });
        return { state: 'EMPTY_DELETED' as const, reason: interview.messages.length ? 'no_answers' : 'no_messages' };
      }
      const endedAt = new Date();
      await tx.interview.update({ where: { id: interviewId }, data: { status: 'COMPLETED', endedAt } });
      return { state: 'RESERVED' as const, interview: { ...interview, endedAt } };
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
