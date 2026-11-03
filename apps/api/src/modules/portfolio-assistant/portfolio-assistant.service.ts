import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { ConfiguredRunJobsService } from '../agent-lab/configured-run-jobs.service';
import { assertSchema, validateConfiguredVersion } from '../agent-lab/configured-runtime.contract';
import { tenantContext } from '../organizations/tenant-context';
import { parsePortfolioRequest, PORTFOLIO_CONTRACT, PORTFOLIO_SELECTOR_PROMPT, PortfolioDocument, portfolioSource, portfolioSourceHash, portfolioDocumentSchema, publicDocumentsFor, selectPublicQuotes } from './portfolio.contract';

import { PORTFOLIO_ADMIT_SCRIPT, PORTFOLIO_RELEASE_SCRIPT } from './portfolio-admission';
export { PORTFOLIO_ADMIT_SCRIPT } from './portfolio-admission';
type Binding = { ownerId: string; secret: string; origins: string[]; versionId: string; daily: number };
type Actor = { id: string; organizationId: string; role: string };
type Entry = { nonce: string; queueKey: string; ownerId: string; organizationId: string; agentId: string; versionId: string; versionHash: string;
  sourceHash: string; sourceRevision: string; requestHash: string; message: string; documents: PortfolioDocument[] };
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const refused = (reason = 'OUT_OF_SCOPE') => ({ contractVersion: PORTFOLIO_CONTRACT, status: 'REFUSED', reason,
  answer: '我只回答张继哲公开简历、项目与文章相关的问题。现有公开资料不足以回答这个问题，请查看网站资料或通过公开邮箱联系作者。', sources: [] });

@Injectable()
export class PortfolioAssistantService {
  constructor(private readonly config: ConfigService, private readonly prisma: PrismaService, private readonly redis: RedisService,
    private readonly jobs: ConfiguredRunJobsService) {}

  private binding(): Binding {
    if (this.config.get<string>('PORTFOLIO_ASSISTANT_ENABLED') !== 'true') throw new ServiceUnavailableException('作品集助手尚未启用');
    const ownerId = this.config.get<string>('PORTFOLIO_ASSISTANT_OWNER_ID') || '';
    const versionId = this.config.get<string>('PORTFOLIO_ASSISTANT_VERSION_ID') || '';
    const secret = this.config.get<string>('PORTFOLIO_ASSISTANT_TICKET_SECRET') || '';
    const origins = (this.config.get<string>('PORTFOLIO_ASSISTANT_ORIGINS') || '').split(',').map(item => item.trim()).filter(Boolean);
    if (!ownerId || !versionId || secret.length < 32 || !origins.length || origins.length > 5
      || origins.some(origin => { try { const url = new URL(origin); return !['http:', 'https:'].includes(url.protocol) || url.origin !== origin || Boolean(url.username || url.password); } catch { return true; } })) {
      throw new ServiceUnavailableException('作品集助手配置未就绪');
    }
    const requested = Number(this.config.get<string>('PORTFOLIO_ASSISTANT_DAILY_LIMIT') ?? 20);
    if (!Number.isInteger(requested) || requested < 1 || requested > 20) throw new ServiceUnavailableException('作品集助手额度配置无效');
    return { ownerId, versionId, secret, origins, daily: requested };
  }

  private async actor(binding: Binding): Promise<Actor> {
    const actor = await this.prisma.user.findUnique({ where: { id: binding.ownerId }, select: { id: true, organizationId: true, role: true } });
    if (!actor || actor.role !== 'ADMIN' || !actor.organizationId) throw new ServiceUnavailableException('作品集助手运行身份不可用');
    return actor;
  }
  private scoped<T>(actor: Actor, work: () => Promise<T>) { return tenantContext.run({ organizationId: actor.organizationId, userId: actor.id }, work); }
  private async version(actor: Actor, versionId: string) {
    const version = await this.prisma.agentVersion.findFirst({ where: { id: versionId, status: 'PUBLISHED', parentAgent: { workspace: { ownerId: actor.id, slug: `personal-${actor.id}` } } } });
    if (!version) throw new ServiceUnavailableException('作品集助手未绑定可用的已发布版本');
    const runtime = validateConfiguredVersion(version);
    const model = version.modelConfig as any;
    if (runtime.adapter !== 'single-agent-v1' || runtime.maxEstimatedCostCny > 0.05 || runtime.maxDurationMs > 30000
      || model.maxTokens > 512 || model.temperature > 0.3 || version.systemPrompt !== PORTFOLIO_SELECTOR_PROMPT) {
      throw new ServiceUnavailableException('作品集助手版本不符合只读选择器合同');
    }
    try { assertSchema(version.outputSchema, { response: '{"selectedIds":[]}' }); }
    catch { throw new ServiceUnavailableException('作品集助手输出合同未就绪'); }
    return { version, hash: digest({ prompt: version.systemPrompt, model: version.modelConfig, runtime: version.runtimeConfig,
      input: version.inputSchema, output: version.outputSchema, tools: version.toolBindings, knowledge: version.knowledgeBindings, memory: version.memoryBindings }) };
  }
  private activeKey(binding: Binding) { return `portfolio:v1:active:${digest(binding.ownerId)}`; }
  private entryKey(nonce: string) { return `portfolio:v1:ticket:${nonce}`; }
  private async redisWork<T>(work: () => Promise<T>) {
    try { return await work(); } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('助手状态存储暂不可用；未自动重发模型请求');
    }
  }
  private async entry(nonce: string, binding: Binding): Promise<Entry> {
    if (!/^[a-f0-9]{48}$/.test(nonce)) throw new ServiceUnavailableException('助手请求记录未确认');
    const raw = await this.redis.get(this.entryKey(nonce));
    if (!raw) throw new NotFoundException('回答票据不存在或已过期');
    try {
      const value = JSON.parse(raw) as Entry;
      if (value.nonce !== nonce || value.ownerId !== binding.ownerId || value.queueKey !== `portfolio-${nonce}`
        || !value.organizationId || !value.agentId || !value.versionId || !/^[a-f0-9]{64}$/.test(value.requestHash)
        || !/^[a-f0-9]{64}$/.test(value.sourceHash) || !/^[a-f0-9]{64}$/.test(value.versionHash)
        || typeof value.message !== 'string' || value.message.length > 10000 || !Array.isArray(value.documents)
        || value.documents.length < 1 || value.documents.length > 3) throw new Error('Invalid record');
      if (new Set(value.documents.map(document => document.id)).size !== value.documents.length) throw new Error('Duplicate documents');
      value.documents = value.documents.map(document => {
        const parsed = portfolioDocumentSchema.parse(document);
        // An older source may only be used to reconcile its existing Run; never quote or re-enqueue it.
        if (value.sourceHash !== portfolioSourceHash) return parsed;
        const current = portfolioSource.documents.find(item => item.id === parsed.id);
        if (!current || current.text !== parsed.text || current.title !== parsed.title || current.href !== parsed.href) throw new Error('Public source mismatch');
        return current;
      });
      const input = JSON.parse(value.message);
      if (input.contractVersion !== PORTFOLIO_CONTRACT || typeof input.question !== 'string' || !input.question.trim() || input.question.length > 500
        || digest(input.documents) !== digest(value.documents.map(({ id, text }) => ({ id, text })))) throw new Error('Input snapshot mismatch');
      return value;
    } catch { throw new ServiceUnavailableException('助手请求记录未确认；请稍后核对'); }
  }
  private async findRun(entry: Entry) {
    return this.prisma.run.findFirst({ where: { requestKey: entry.queueKey, requestedByUserId: entry.ownerId,
      agentId: entry.agentId, agentVersionId: entry.versionId, workspace: { ownerId: entry.ownerId } },
    select: { id: true, status: true, output: true } });
  }
  private async ensureEnqueued(entry: Entry, actor: Actor) {
    const existing = await this.findRun(entry);
    if (existing) return existing; // Includes FAILED/CANCELLED. Never replay a terminal request.
    const { version, hash } = await this.version(actor, entry.versionId);
    if (hash !== entry.versionHash || version.agentId !== entry.agentId || entry.sourceHash !== portfolioSourceHash) {
      throw new ServiceUnavailableException('助手绑定已变化，旧请求不能自动执行');
    }
    await this.jobs.enqueue(actor.id, entry.agentId, { agentVersionId: entry.versionId, requestKey: entry.queueKey, input: { message: entry.message } }, false);
    return this.findRun(entry);
  }
  private async release(entry: Entry, binding: Binding) {
    await this.redis.getClient().eval(PORTFOLIO_RELEASE_SCRIPT, 2, this.activeKey(binding), this.entryKey(entry.nonce), entry.nonce);
  }
  private async reconcile(binding: Binding, actor: Actor) {
    const active = await this.redis.getClient().smembers(this.activeKey(binding));
    if (active.length > 2) throw new ServiceUnavailableException('助手准入状态需要核对');
    for (const nonce of active) {
      const entry = await this.entry(nonce, binding);
      if (entry.organizationId !== actor.organizationId) throw new ServiceUnavailableException('助手请求身份已变化');
      const run = await this.ensureEnqueued(entry, actor);
      if (run && !['PENDING', 'RUNNING'].includes(run.status)) await this.release(entry, binding);
    }
  }
  private ticket(nonce: string, binding: Binding) { return `${nonce}.${createHmac('sha256', binding.secret).update(nonce).digest('base64url')}`; }
  private nonce(ticket: string, binding: Binding) {
    if (!/^[a-f0-9]{48}\.[A-Za-z0-9_-]{43}$/.test(ticket)) throw new NotFoundException('回答票据无效');
    const [nonce, signature] = ticket.split('.');
    const expected = this.ticket(nonce, binding).split('.')[1];
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new NotFoundException('回答票据无效');
    return nonce;
  }

  async submit(body: unknown, origin: string | undefined, clientAddress: string) {
    const binding = this.binding();
    if (!origin || !binding.origins.includes(origin)) throw new ForbiddenException('该来源未开放作品集助手');
    const dto = parsePortfolioRequest(body);
    const selection = publicDocumentsFor(dto.message);
    if (!selection.documents.length) return refused(selection.reason);
    const actor = await this.actor(binding);
    return this.scoped(actor, () => this.redisWork(async () => {
      const resolved = await this.version(actor, binding.versionId);
      const message = JSON.stringify({ contractVersion: PORTFOLIO_CONTRACT, question: dto.message,
        documents: selection.documents.map(({ id, text }) => ({ id, text })) });
      if (message.length > 10000) throw new BadRequestException('公开资料上下文超长');
      try { assertSchema(resolved.version.inputSchema, { message }); }
      catch { throw new ServiceUnavailableException('作品集助手输入合同未就绪；未创建运行'); }
      await this.reconcile(binding, actor);
      const nonce = randomBytes(24).toString('hex');
      const visitor = createHmac('sha256', binding.secret).update(clientAddress || 'unknown').digest('hex');
      const requestHash = digest({ question: dto.message, source: portfolioSourceHash, version: resolved.hash, owner: actor.id });
      const record: Entry = { nonce, queueKey: `portfolio-${nonce}`, ownerId: actor.id, organizationId: actor.organizationId,
        agentId: resolved.version.agentId, versionId: resolved.version.id, versionHash: resolved.hash,
        sourceHash: portfolioSourceHash, sourceRevision: portfolioSource.source.revision, requestHash, message, documents: selection.documents };
      const day = new Date().toISOString().slice(0, 10), minute = Math.floor(Date.now() / 60000);
      const keys = [`portfolio:v1:request:${digest(actor.id)}:${dto.requestKey}`, `portfolio:v1:day:${digest(actor.id)}:${day}`,
        `portfolio:v1:visitor:${visitor}:${minute}`, this.activeKey(binding), this.entryKey(nonce)];
      const admission = await this.redis.getClient().eval(PORTFOLIO_ADMIT_SCRIPT, 5, ...keys, nonce, JSON.stringify(record), String(binding.daily)) as [number, string];
      if (!Array.isArray(admission) || ![0, 1, -1].includes(Number(admission[0]))) throw new ServiceUnavailableException('助手准入回执未确认');
      if (Number(admission[0]) === -1) throw new HttpException('助手当前请求较多或当日额度已用完，请稍后再试。', 429);
      const actual = await this.entry(String(admission[1]), binding);
      if (actual.requestHash !== requestHash) throw new ConflictException('requestKey已用于不同问题或资料版本；不会自动重跑');
      const run = await this.ensureEnqueued(actual, actor);
      return { contractVersion: PORTFOLIO_CONTRACT, status: run?.status === 'RUNNING' ? 'RUNNING' : 'PENDING',
        ticket: this.ticket(actual.nonce, binding), reused: Number(admission[0]) === 0, pollAfterMs: 1500 };
    }));
  }

  async answer(ticket: string) {
    const binding = this.binding(), nonce = this.nonce(ticket, binding), actor = await this.actor(binding);
    return this.scoped(actor, () => this.redisWork(async () => {
      const entry = await this.entry(nonce, binding);
      if (entry.organizationId !== actor.organizationId) throw new NotFoundException('回答票据无效');
      const run = await this.ensureEnqueued(entry, actor);
      if (!run || ['PENDING', 'RUNNING'].includes(run.status)) return { contractVersion: PORTFOLIO_CONTRACT, status: run?.status ?? 'PENDING', pollAfterMs: 1500 };
      await this.release(entry, binding);
      if (run.status !== 'COMPLETED') return { contractVersion: PORTFOLIO_CONTRACT, status: 'FAILED', answer: '本次回答未成功，请稍后查看；不会自动重放模型请求。', sources: [] };
      if (entry.sourceHash !== portfolioSourceHash) return refused('SOURCE_CHANGED');
      try {
        const sources = selectPublicQuotes((run.output as any)?.response, entry.documents);
        if (!sources.length) return refused('NO_PUBLIC_EVIDENCE');
        return { contractVersion: PORTFOLIO_CONTRACT, status: 'COMPLETED', answer: `以下摘录来自作者公开页面，未独立核验其履历或项目效果：\n\n${sources.map(source => source.quote).join('\n\n')}`,
          sources, sourceRevision: entry.sourceRevision, evidenceMode: 'verbatim-public-excerpts' };
      } catch { return { contractVersion: PORTFOLIO_CONTRACT, status: 'FAILED', answer: '回答未通过公开来源校验，未展示模型原文。', sources: [] }; }
    }));
  }
}
