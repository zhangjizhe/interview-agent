import { ConflictException, ForbiddenException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { requireTenant, tenantContext } from '../organizations/tenant-context';
import { EvaluationService } from './evaluation.service';
import type { StartEvaluationJobDto, RunEvaluationDto } from './dto/agent.dto';

export const EVALUATION_JOB_LEASE_MS = 6 * 60_000;
const JOB_CONTRACT = 'evaluation-job/v1';
type JobRequest = { contract: string; dto: RunEvaluationDto; assetHash: string };

@Injectable()
export class EvaluationJobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EvaluationJobsService.name);
  private readonly owner = randomUUID();
  private timer?: NodeJS.Timeout;
  private heartbeat?: NodeJS.Timeout;
  private busy = false;
  private stopping = false;
  private cursor?: string;

  constructor(private prisma: PrismaService, private evaluations: EvaluationService) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      this.tick().catch(() => this.logger.warn({ event: 'evaluation_queue_unavailable' }));
    }, 2000);
    this.timer.unref();
  }
  onModuleDestroy() {
    this.stopping = true;
    clearInterval(this.timer);
    clearInterval(this.heartbeat);
    // Interrupted jobs expire to FAILED. They are never put back in PENDING.
  }

  async enqueue(userId: string, agentId: string, dto: StartEvaluationJobDto) {
    const scope = requireTenant();
    if (!scope.userId || scope.userId !== userId) throw new ForbiddenException('评测任务需要当前认证身份');
    const prepared = await this.evaluations.prepareEvaluation(userId, agentId, dto);
    const request: JobRequest = { contract: JOB_CONTRACT, assetHash: prepared.assetHash,
      dto: { datasetId: dto.datasetId, evaluatorId: dto.evaluatorId,
        agentVersionId: prepared.version.id, repeatCount: prepared.repeatCount,
        ...(prepared.effectiveBudgetCny === null ? {} : { maxEstimatedCostCny: prepared.effectiveBudgetCny }) } };
    const requestHash = createHash('sha256').update(JSON.stringify(request)).digest('hex');
    const sameKey = await this.prisma.agentEvaluationRun.findFirst({
      where: { workspaceId: prepared.workspace.id, requestKey: dto.requestKey },
    });
    if (sameKey) return this.reuse(sameKey, requestHash);
    try {
      const job = await this.prisma.agentEvaluationRun.create({ data: {
        workspaceId: prepared.workspace.id, agentId, agentVersionId: prepared.version.id,
        datasetId: dto.datasetId, evaluatorId: dto.evaluatorId, status: 'PENDING',
        requestKey: dto.requestKey, requestHash, requestParams: request as unknown as Prisma.InputJsonValue,
        requestedByUserId: scope.userId, totalCases: prepared.dataset.cases.length,
        metrics: { jobContract: JOB_CONTRACT, repeatCount: prepared.repeatCount,
          totalSamples: prepared.dataset.cases.length * prepared.repeatCount },
      } });
      return this.receipt(job, false);
    } catch (error: any) {
      if (error?.code !== 'P2002') throw error;
      const existing = await this.prisma.agentEvaluationRun.findFirst({
        where: { workspaceId: prepared.workspace.id, requestKey: dto.requestKey },
      });
      if (existing) return this.reuse(existing, requestHash);
      throw new ConflictException('该 Agent 已有排队或运行中的评测，请查询现有任务后再提交');
    }
  }

  private reuse(job: any, hash: string) {
    if (job.requestHash !== hash) throw new ConflictException('requestKey 已用于不同评测；请核对请求，不会自动重跑');
    return this.receipt(job, true);
  }
  private receipt(job: any, reused: boolean) {
    return { id: job.id, status: job.status, totalCases: job.totalCases,
      completedSamples: job.completedSamples, completedCases: job.completedCases,
      reused, statusUrl: `/api/agent-lab/evaluations/${job.id}` };
  }

  /** Poll durable records, rotate organizations fairly, and atomically claim
   * one job per API process. Tenant queries always run in an explicit scope. */
  async tick() {
    if (this.busy || this.stopping) return;
    this.busy = true;
    try {
      const organizations = await this.prisma.organization.findMany({
        where: this.cursor ? { id: { gt: this.cursor } } : {}, select: { id: true }, orderBy: { id: 'asc' }, take: 50,
      });
      if (!organizations.length) { this.cursor = undefined; return; }
      for (const organization of organizations) {
        this.cursor = organization.id;
        const claimed = await tenantContext.run({ organizationId: organization.id }, async () => {
          await this.recoverExpired();
          const job = await this.prisma.agentEvaluationRun.findFirst({
            where: { status: 'PENDING', requestKey: { not: null } }, orderBy: { createdAt: 'asc' },
          });
          if (!job) return null;
          const startedAt = new Date();
          const claim = await this.prisma.agentEvaluationRun.updateMany({
            where: { id: job.id, status: 'PENDING' },
            data: { status: 'RUNNING', startedAt, heartbeatAt: startedAt, leaseOwner: this.owner },
          });
          return claim.count === 1 ? { ...job, startedAt, leaseOwner: this.owner } : null;
        });
        if (claimed) {
          await tenantContext.run({ organizationId: organization.id, userId: claimed.requestedByUserId }, () => this.execute(claimed));
          return;
        }
      }
    } finally { this.busy = false; }
  }

  async recoverExpired() {
    const cutoff = new Date(Date.now() - EVALUATION_JOB_LEASE_MS);
    const expired = await this.prisma.agentEvaluationRun.findMany({
      where: { status: 'RUNNING', requestKey: { not: null }, heartbeatAt: { lt: cutoff } }, take: 100,
    });
    for (const job of expired) {
      const metrics = (job.metrics ?? {}) as Record<string, any>;
      await this.prisma.agentEvaluationRun.updateMany({
        where: { id: job.id, status: 'RUNNING', heartbeatAt: { lt: cutoff } },
        data: { status: 'FAILED', completedAt: new Date(), leaseOwner: null,
          metrics: { ...metrics, budget: { ...metrics.budget, status: 'interrupted', costEvidenceStatus: 'unavailable' } },
          error: 'EVALUATION_INTERRUPTED：任务心跳过期，可能有未核验费用；已停止，不会自动重放。' },
      });
    }
  }

  private async execute(job: any) {
    const where = { id: job.id, status: 'RUNNING' as const, leaseOwner: this.owner };
    let lost = false;
    this.heartbeat = setInterval(() => {
      this.prisma.agentEvaluationRun.updateMany({ where, data: { heartbeatAt: new Date() } })
        .then(result => { if (result.count !== 1) lost = true; }).catch(() => { lost = true; });
    }, 10_000);
    this.heartbeat.unref();
    try {
      const request = job.requestParams as JobRequest;
      if (request?.contract !== JOB_CONTRACT || !job.requestedByUserId) throw new Error('EVALUATION_REQUEST_INVALID');
      const user = await this.prisma.user.findFirst({ where: { id: job.requestedByUserId }, select: { role: true } });
      if (user?.role !== 'ADMIN') throw new Error('EVALUATION_PERMISSION_REVOKED：管理员权限已撤销，未调用模型。');
      await this.evaluations.runEvaluation(job.requestedByUserId, job.agentId, request.dto, {
        id: job.id, startedAt: job.startedAt, assetHash: request.assetHash,
        progress: async progress => {
          if (lost || this.stopping) throw new Error('EVALUATION_LEASE_LOST');
          const currentUser = await this.prisma.user.findFirst({ where: { id: job.requestedByUserId }, select: { role: true } });
          if (currentUser?.role !== 'ADMIN') throw new Error('EVALUATION_PERMISSION_REVOKED');
          const update = await this.prisma.agentEvaluationRun.updateMany({ where, data: {
            heartbeatAt: new Date(), completedSamples: progress.completedSamples, completedCases: progress.completedCases,
            metrics: { jobContract: JOB_CONTRACT, repeatCount: request.dto.repeatCount,
              totalSamples: job.totalCases * (request.dto.repeatCount ?? 1),
              budget: { status: 'running', spentCny: progress.spentCny, limitCny: progress.limitCny, costEvidenceStatus: progress.costEvidenceStatus } },
          } });
          if (update.count !== 1) throw new Error('EVALUATION_LEASE_LOST');
        },
        finish: async data => {
          const update = await this.prisma.agentEvaluationRun.updateMany({ where, data: { ...data, leaseOwner: null } });
          if (update.count !== 1) throw new Error('EVALUATION_LEASE_LOST');
          return this.prisma.agentEvaluationRun.findFirst({ where: { id: job.id } });
        },
      });
    } catch (error) {
      // A failure before execution, lost worker or unknown model outcome must
      // never trigger automatic paid retries. Keep all collected evidence.
      const current = await this.prisma.agentEvaluationRun.findFirst({ where });
      const metrics = (current?.metrics ?? {}) as Record<string, any>;
      await this.prisma.agentEvaluationRun.updateMany({ where, data: {
        status: 'FAILED', completedAt: new Date(), leaseOwner: null,
        metrics: { ...metrics, budget: { ...metrics.budget, status: 'interrupted', costEvidenceStatus: 'unavailable' } },
        error: error instanceof ConflictException ? 'EVALUATION_ASSETS_CHANGED：资产已变化，未启动模型，请核对后明确创建新任务。'
          : String((error as Error)?.message).startsWith('EVALUATION_PERMISSION_REVOKED')
            ? 'EVALUATION_PERMISSION_REVOKED：管理员权限已撤销，已停止后续样本。'
            : 'EVALUATION_INTERRUPTED：任务未完成，请核对评测详情、权限与费用后明确创建新任务。',
      } });
      this.logger.warn({ event: 'evaluation_job_failed', evaluationId: job.id });
    } finally { clearInterval(this.heartbeat); this.heartbeat = undefined; }
  }
}
