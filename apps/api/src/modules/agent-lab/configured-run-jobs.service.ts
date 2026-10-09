import { ConflictException, ForbiddenException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { requireTenant, tenantContext } from '../organizations/tenant-context';
import { AgentRuntimeService } from './agent-runtime.service';
import { StartConfiguredRunDto } from './dto/agent.dto';
const LEASE_MS = 90_000;
@Injectable()
export class ConfiguredRunJobsService implements OnModuleInit, OnModuleDestroy {
  private owner = randomUUID();
  private timer?: NodeJS.Timeout;
  private heartbeat?: NodeJS.Timeout;
  private busy = false;
  private stopping = false;
  private cursor?: string;
  private logger = new Logger(ConfiguredRunJobsService.name);
  constructor(private prisma: PrismaService, private runtime: AgentRuntimeService) {}
  onModuleInit() {
    this.timer = setInterval(() => { this.tick().catch(() => this.logger.warn({ event: 'configured_queue_unavailable' })); }, 2000);
    this.timer.unref();
  }
  onModuleDestroy() { this.stopping = true; clearInterval(this.timer); clearInterval(this.heartbeat); }
  async enqueue(userId: string, agentId: string, dto: StartConfiguredRunDto, draft: boolean) {
    if (requireTenant().userId !== userId) throw new ForbiddenException('需要当前认证身份');
    const { workspace, version } = await this.runtime.prepareConfiguredRun(userId, agentId, dto, draft);
    const requestHash = createHash('sha256').update(JSON.stringify({ agentId, versionId: version.id, input: dto.input, draft })).digest('hex');
    const reuse = (run: any) => {
      if (run.requestHash !== requestHash) throw new ConflictException('requestKey已用于不同请求；不会自动重跑');
      return { id: run.id, status: run.status, reused: true };
    };
    const existing = await this.prisma.run.findFirst({ where: { workspaceId: workspace.id, requestKey: dto.requestKey } });
    if (existing) return reuse(existing);
    try {
      const run = await this.prisma.run.create({ data: { workspaceId: workspace.id, agentId,
        agentVersionId: version.id, input: dto.input as any, application: draft ? 'lab-draft-test' : 'lab-configured-run',
        status: 'PENDING', requestKey: dto.requestKey, requestHash, requestedByUserId: userId,
        budget: { maxToolCalls: 0, draft, maxModelCalls: (version.runtimeConfig as any).nodes?.length ?? 1 },
      } });
      return { id: run.id, status: run.status, reused: false };
    } catch (error: any) {
      if (error.code !== 'P2002') throw error;
      const run = await this.prisma.run.findFirst({ where: { workspaceId: workspace.id, requestKey: dto.requestKey } });
      if (run) return reuse(run);
      throw new ConflictException('工作区已有运行；请查看现有状态');
    }
  }
  async cancel(userId: string, runId: string) {
    const run = await this.runtime.getRun(userId, runId);
    if (!run.requestKey) throw new ConflictException('历史运行不支持队列取消');
    const now = new Date();
    await this.prisma.run.updateMany({ where: { id: runId, status: 'PENDING' }, data: { status: 'CANCELLED', cancelRequestedAt: now, completedAt: now, estimatedCost: 0 } });
    await this.prisma.run.updateMany({ where: { id: runId, status: 'RUNNING', cancelRequestedAt: null }, data: { cancelRequestedAt: now } });
    return this.runtime.getRun(userId, runId);
  }
  async tick() {
    if (this.busy || this.stopping) return;
    this.busy = true;
    try {
      const organizations = await this.prisma.organization.findMany({ where: this.cursor ? { id: { gt: this.cursor } } : {}, select: { id: true }, take: 50, orderBy: { id: 'asc' } });
      if (!organizations.length) { this.cursor = undefined; return; }
      for (const organization of organizations) {
        this.cursor = organization.id;
        const run = await tenantContext.run({ organizationId: organization.id }, async () => {
          await this.recoverExpired();
          const pending = await this.prisma.run.findFirst({ where: { status: 'PENDING', requestKey: { not: null } }, orderBy: { createdAt: 'asc' } });
          if (!pending) return null;
          const startedAt = new Date();
          const claimed = await this.prisma.run.updateMany({ where: { id: pending.id, status: 'PENDING' }, data: { status: 'RUNNING', startedAt, heartbeatAt: startedAt, leaseOwner: this.owner } });
          return claimed.count ? { ...pending, startedAt, status: 'RUNNING', leaseOwner: this.owner } : null;
        });
        if (!run) continue;
        await tenantContext.run({ organizationId: organization.id, userId: run.requestedByUserId! }, async () => {
          const actor = await this.prisma.user.findFirst({ where: { id: run.requestedByUserId!, role: 'ADMIN' }, select: { id: true } });
          if (!actor) {
            await this.prisma.run.updateMany({ where: { id: run.id, status: 'RUNNING', leaseOwner: this.owner }, data: { status: 'FAILED', error: '执行前管理员权限已失效；未发起模型调用', completedAt: new Date() } });
            return;
          }
          this.heartbeat = setInterval(() => {
            this.prisma.run.updateMany({ where: { id: run.id, status: 'RUNNING', leaseOwner: this.owner }, data: { heartbeatAt: new Date() } }).catch(() => this.logger.warn({ event: 'configured_heartbeat_failed' }));
          }, 15000);
          try {
            await this.runtime.runAgent(run.requestedByUserId!, run.agentId, { input: run.input as any, agentVersionId: run.agentVersionId },
              { allowDraftVersion: run.application === 'lab-draft-test', queuedRun: run });
          } catch {
            await this.prisma.run.updateMany({ where: { id: run.id, status: 'RUNNING', leaseOwner: this.owner }, data: { status: 'FAILED', error: '配置执行失败；请查看Trace及费用证据', completedAt: new Date() } });
          } finally { clearInterval(this.heartbeat); }
        });
        return;
      }
    } finally { this.busy = false; }
  }
  async recoverExpired() {
    const expired = await this.prisma.run.findMany({ where: { status: 'RUNNING', requestKey: { not: null }, heartbeatAt: { lt: new Date(Date.now() - LEASE_MS) } }, take: 100 });
    for (const run of expired) {
      const failed = await this.prisma.run.updateMany({ where: { id: run.id, status: 'RUNNING', heartbeatAt: run.heartbeatAt }, data: { status: 'FAILED', error: '运行租约过期；在途费用可能未知，不自动重放', completedAt: new Date() } });
      if (failed.count) await this.prisma.run.updateMany({ where: { parentRunId: run.id, status: 'RUNNING' }, data: { status: 'FAILED', error: '父运行租约过期', completedAt: new Date() } });
    }
  }
}
