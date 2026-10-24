import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infra/prisma/prisma.service';

export type StreamMessageClaim =
  | { state: 'new'; message: { id: string } }
  | { state: 'replay'; content: string }
  | { state: 'pending' }
  | { state: 'conflict' };

@Injectable()
export class StreamMessageDeliveryService {
  constructor(private prisma: PrismaService) {}

  async claimCandidateMessage(
    interviewId: string,
    content: string,
    clientMessageId?: string,
    presentationId?: string,
  ): Promise<StreamMessageClaim> {
    if (!clientMessageId) {
      const message = await this.prisma.message.create({
        data: { interviewId, role: 'user', content, ...(presentationId ? { metadata: { presentationId } } : {}) },
        select: { id: true },
      });
      return { state: 'new', message };
    }

    const existing = await this.prisma.message.findUnique({
      where: { clientMessageId },
      select: { id: true, interviewId: true, role: true, content: true, metadata: true },
    });
    if (existing) return this.resolveExisting(existing, interviewId, content, presentationId);

    try {
      const message = await this.prisma.message.create({
        data: { interviewId, role: 'user', content, clientMessageId, ...(presentationId ? { metadata: { presentationId } } : {}) },
        select: { id: true },
      });
      return { state: 'new', message };
    } catch (error: any) {
      if (error?.code !== 'P2002') throw error;
      const raced = await this.prisma.message.findUnique({
        where: { clientMessageId },
        select: { id: true, interviewId: true, role: true, content: true, metadata: true },
      });
      return raced
        ? this.resolveExisting(raced, interviewId, content, presentationId)
        : { state: 'pending' };
    }
  }

  async persistAssistantResponse(
    interviewId: string,
    candidateMessageId: string,
    content: string,
    promptTokens: number,
    completionTokens: number,
  ) {
    return this.prisma.message.create({
      data: {
        interviewId,
        role: 'assistant',
        content,
        replyToMessageId: candidateMessageId,
        promptTokens,
        completionTokens,
      },
    });
  }

  async releaseUnansweredMessage(candidateMessageId: string) {
    await this.prisma.message.deleteMany({
      where: { id: candidateMessageId, role: 'user', replyMessage: { is: null } },
    });
  }

  private async resolveExisting(
    existing: { id: string; interviewId: string; role: string; content: string; metadata?: unknown },
    interviewId: string,
    content: string,
    presentationId?: string,
  ): Promise<StreamMessageClaim> {
    if (
      existing.interviewId !== interviewId
      || existing.role !== 'user'
      || existing.content !== content
      || ((existing.metadata as any)?.presentationId || undefined) !== presentationId
    ) {
      return { state: 'conflict' };
    }

    if (presentationId) {
      const receipt = await this.prisma.interviewQuestionPresentation.findFirst({
        where: { id: presentationId, interviewId, claimMessageId: existing.id },
        select: { state: true },
      });
      // A saved model reply is not proof of a confirmed scored answer. Never
      // turn a PROCESSING/UNKNOWN claim into a successful transport replay.
      if (receipt?.state !== 'ANSWERED') return { state: 'pending' };
    }

    const response = await this.prisma.message.findFirst({
      where: { replyToMessageId: existing.id },
      select: { content: true },
    });
    return response ? { state: 'replay', content: response.content } : { state: 'pending' };
  }
}
