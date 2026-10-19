import { ConflictException, Injectable, Logger } from '@nestjs/common';
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
    const currentVersion = application.agent.currentVersion;
    if (!currentVersion || currentVersion.status !== 'PUBLISHED') {
      throw new ConflictException('Interview Lab 需要已发布的 Agent 版本快照');
    }
    // Capture primitives before the next await: concurrent publication must not
    // change which policy is attributed to this turn's external Run.
    const snapshot = {
      id: currentVersion.id,
      version: currentVersion.version,
      approvedPolicy: currentVersion.systemPrompt.slice(0, 12_000),
    };
    const run = await this.runtime.startExternalRun(userId, application.agentId, {
      agentVersionId: snapshot.id,
      application: 'interview',
      externalRunId: interview.id,
      input: {
        message,
        position: interview.position,
        level: interview.level,
        sessionId: interview.id,
      },
    });
    try {
      if (run.agentVersionId !== snapshot.id) {
        throw new ConflictException('Interview Lab Run 版本与已发布策略快照不一致');
      }
      await this.prisma.applicationRun.create({
        data: {
          applicationId: application.id,
          runId: run.id,
          externalSessionId: interview.id,
        },
      });
    } catch (error) {
      // The external Run exists already. Do not leave it RUNNING if the bridge
      // rejects its identity or cannot persist the application association.
      await this.failTurn(run.id, error);
      throw error;
    }
    return {
      ...run,
      approvedPolicy: snapshot.approvedPolicy,
      agentVersion: { id: snapshot.id, version: snapshot.version },
    };
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
