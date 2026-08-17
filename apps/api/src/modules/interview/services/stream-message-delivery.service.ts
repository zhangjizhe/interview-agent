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
  ): Promise<StreamMessageClaim> {
    if (!clientMessageId) {
      const message = await this.prisma.message.create({
        data: { interviewId, role: 'user', content },
        select: { id: true },
      });
      return { state: 'new', message };
    }

    const existing = await this.prisma.message.findUnique({
      where: { clientMessageId },
      select: { id: true, interviewId: true, role: true, content: true },
    });
    if (existing) return this.resolveExisting(existing, interviewId, content);

    try {
      const message = await this.prisma.message.create({
        data: { interviewId, role: 'user', content, clientMessageId },
        select: { id: true },
      });
      return { state: 'new', message };
    } catch (error: any) {
      if (error?.code !== 'P2002') throw error;
      const raced = await this.prisma.message.findUnique({
        where: { clientMessageId },
        select: { id: true, interviewId: true, role: true, content: true },
      });
      return raced
        ? this.resolveExisting(raced, interviewId, content)
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
    existing: { id: string; interviewId: string; role: string; content: string },
    interviewId: string,
    content: string,
  ): Promise<StreamMessageClaim> {
    if (
      existing.interviewId !== interviewId
      || existing.role !== 'user'
      || existing.content !== content
    ) {
      return { state: 'conflict' };
    }

    const response = await this.prisma.message.findFirst({
      where: { replyToMessageId: existing.id },
      select: { content: true },
    });
    return response ? { state: 'replay', content: response.content } : { state: 'pending' };
  }
}
