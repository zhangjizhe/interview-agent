import { Injectable, Logger } from '@nestjs/common';
import { ApplicationService } from './application.service';
import { AgentRuntimeService } from './agent-runtime.service';
import { PrismaService } from '../../infra/prisma/prisma.service';

@Injectable()
export class InterviewLabBridgeService {
  private readonly logger = new Logger(InterviewLabBridgeService.name);

  constructor(
    private readonly applications: ApplicationService,
    private readonly runtime: AgentRuntimeService,
    private readonly prisma: PrismaService,
  ) {}

  async startTurn(userId: string, interview: { id: string; position: string; level: string }, message: string) {
    const application = await this.applications.bootstrapInterviewApplication(userId);
    const run = await this.runtime.startExternalRun(userId, application.agentId, {
      application: 'interview',
      externalRunId: interview.id,
      input: {
        message,
        position: interview.position,
        level: interview.level,
        sessionId: interview.id,
      },
    });
    await this.prisma.applicationRun.create({
      data: {
        applicationId: application.id,
        runId: run.id,
        externalSessionId: interview.id,
      },
    });
    return run;
  }

  async completeTurn(runId: string, response: string) {
    return this.runtime.completeExternalRun(runId, { response });
  }

  async failTurn(runId: string, error: unknown) {
    const message = error instanceof Error ? error.message : 'Interview 执行失败';
    try {
      await this.runtime.failExternalRun(runId, message);
    } catch (bridgeError: any) {
      this.logger.warn(`Interview Lab Run ${runId} 写入失败: ${bridgeError?.message || 'unknown error'}`);
    }
  }
}
