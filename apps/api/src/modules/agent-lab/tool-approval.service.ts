import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

export type ApprovalResolution =
  | 'APPROVED'
  | 'DENIED'
  | 'CANCELLED'
  | 'TIMED_OUT'
  | 'ERROR';

@Injectable()
export class ToolApprovalService {
  constructor(private readonly prisma: PrismaService) {}

  async request(
    runId: string,
    callId: string,
    toolName: string,
    request: Record<string, unknown>,
  ) {
    return this.prisma.toolApproval.create({
      data: {
        runId,
        callId,
        toolName,
        status: 'PENDING',
        request: request as any,
      },
    });
  }

  async resolve(
    runId: string,
    callId: string,
    status: ApprovalResolution,
    decision: Record<string, unknown>,
  ) {
    return this.prisma.toolApproval.update({
      where: { runId_callId: { runId, callId } },
      data: {
        status,
        decision: decision as any,
        resolvedAt: new Date(),
      },
    });
  }
}
