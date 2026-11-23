import { QuotaService } from './usage/quota.service';
import { requireTenant } from '../organizations/tenant-context';
import { HttpException } from '@nestjs/common';
import { Injectable, Logger, ServiceUnavailableException, BadRequestException, Optional } from '@nestjs/common';
import { LlmPricingCatalogService } from './cost/llm-pricing-catalog.service';
import { QwenProvider } from './providers/qwen.provider';
import { DeepseekProvider } from './providers/deepseek.provider';
import { BaseLLMProvider } from './providers/base.provider';
import { LangfuseService } from '../../infra/langfuse/langfuse.service';
import { ChatParams, ChatResponse, LLMProviderName, StreamChunk } from './providers/types';
import { PromptCacheInterceptor } from './cache/prompt-cache.interceptor';
import { SemanticCacheService, SemanticCacheType } from './cache/semantic-cache.service';
import { answerCacheFingerprint } from './cache/answer-cache.fingerprint';
import { SessionCostTracker } from './cost/session-cost.tracker';

/**
 * LLM 网关 - 核心亮点
 *
 * 职责（v13 原有）：
 *  1. 多模型路由（按场景选择最合适的 Provider）
 *  2. 故障降级（主 Provider 失败 → 备用 Provider）
 *  3. Token 计量（结合 Langfuse 记录成本）
 *  4. 抽象统一接口（业务方无感知）
 *
 * P0 新增：
 *  5. Prompt Cache（自动识别 3 段前缀，注入 prompt_cache_key）
 *  6. Answer Cache（白名单文本场景：完整请求精确匹配，v2）
 *  7. 会话级成本埋点
 *
 * Bug 修复：Provider 永久错（401/403/404）检测
 *  - 401/403 = 认证失败,key 错了,fallback 没意义,直接标 dead
 *  - 404 = 模型不存在
 *  - 5xx / 429 = 临时错,走 fallback
 *  - 进程级 disabled 状态,新 key 后用 setProviderEnabled 重新启用
 */
type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface ProviderCircuitBreaker {
  state: CircuitState;
  consecutiveFailures: number;
  openedAt: number | null;
  halfOpenProbeInFlight: boolean;
  totalTrips: number;
  totalFallbacks: number;
  lastError?: string;
}

@Injectable()
export class LlmGatewayService {
  private readonly logger = new Logger(LlmGatewayService.name);
  private providers: Map<LLMProviderName, BaseLLMProvider>;
  private fallbackMap: Map<LLMProviderName, LLMProviderName> = new Map([
    ['qwen', 'deepseek'],
    ['deepseek', 'qwen'],
  ]);
  /** 进程级 provider 状态：401/403/404 后置为 false，避免每次都打 fallback */
  private providerEnabled: Map<LLMProviderName, boolean> = new Map([
    ['qwen', true],
    ['deepseek', true],
  ]);
  /** provider 永久错误原因（用于可观测） */
  private providerDisabledReason: Map<LLMProviderName, string> = new Map();
  /** 瞬态错误熔断器配置（支持环境变量覆盖） */
  private readonly circuitFailureThreshold = Math.max(1, Number(process.env.LLM_CB_FAILURE_THRESHOLD || 3));
  private readonly circuitCooldownMs = Math.max(1000, Number(process.env.LLM_CB_COOLDOWN_MS || 60_000));
  private readonly circuitBreakers: Map<LLMProviderName, ProviderCircuitBreaker> = new Map([
    ['qwen', { state: 'CLOSED', consecutiveFailures: 0, openedAt: null, halfOpenProbeInFlight: false, totalTrips: 0, totalFallbacks: 0 }],
    ['deepseek', { state: 'CLOSED', consecutiveFailures: 0, openedAt: null, halfOpenProbeInFlight: false, totalTrips: 0, totalFallbacks: 0 }],
  ]);

  constructor(
    private qwen: QwenProvider,
    private deepseek: DeepseekProvider,
    private langfuse: LangfuseService,
    private promptCache: PromptCacheInterceptor,
    private semanticCache: SemanticCacheService,
    private costTracker: SessionCostTracker,
    private quota: QuotaService,
    @Optional() private pricing: LlmPricingCatalogService = new LlmPricingCatalogService(),
  ) {
    this.providers = new Map<LLMProviderName, BaseLLMProvider>([
      ['qwen', this.qwen],
      ['deepseek', this.deepseek],
    ]);
  }

  /**
   * 判断 Provider 当前是否可路由：
   * - 永久禁用（401/402/403/404）返回 false
   * - 熔断器 OPEN 且未过冷却期返回 false
   * - 冷却期满转入 HALF_OPEN，仅放行 1 个探测请求
   */
  private isProviderRoutable(name: LLMProviderName): boolean {
    if (this.providerEnabled.get(name) !== true) return false;
    const cb = this.circuitBreakers.get(name);
    if (!cb) return true;
    if (cb.state === 'CLOSED') return true;
    if (cb.state === 'OPEN') {
      if (cb.openedAt !== null && Date.now() - cb.openedAt >= this.circuitCooldownMs) {
        cb.state = 'HALF_OPEN';
        cb.halfOpenProbeInFlight = true;
        this.logger.warn(`[${name}] CIRCUIT HALF_OPEN: allowing recovery probe`);
        return true;
      }
      return false;
    }
    if (cb.halfOpenProbeInFlight) return false;
    cb.halfOpenProbeInFlight = true;
    return true;
  }

  private recordProviderSuccess(name: LLMProviderName): void {
    const cb = this.circuitBreakers.get(name);
    if (!cb) return;
    if (cb.state !== 'CLOSED' || cb.consecutiveFailures > 0) {
      this.logger.log(`[${name}] CIRCUIT CLOSED (recovered)`);
    }
    cb.state = 'CLOSED';
    cb.consecutiveFailures = 0;
    cb.openedAt = null;
    cb.halfOpenProbeInFlight = false;
    cb.lastError = undefined;
  }

  private recordProviderFailure(name: LLMProviderName, err: any): void {
    if (this.isPermanentProviderError(err)) {
      this.disableProvider(name, 'Provider authentication, billing or model configuration failed');
      return;
    }
    const cb = this.circuitBreakers.get(name);
    if (!cb) return;
    cb.consecutiveFailures += 1;
    cb.halfOpenProbeInFlight = false;
    cb.lastError = typeof err?.message === 'string' ? err.message.slice(0, 200) : 'transient provider error';
    if (cb.state === 'HALF_OPEN' || cb.consecutiveFailures >= this.circuitFailureThreshold) {
      cb.state = 'OPEN';
      cb.openedAt = Date.now();
      cb.totalTrips += 1;
      this.logger.error(`[${name}] CIRCUIT OPEN after ${cb.consecutiveFailures} failures (cooldown=${this.circuitCooldownMs}ms): ${cb.lastError}`);
    }
  }

  private recordFallback(from: LLMProviderName): void {
    const cb = this.circuitBreakers.get(from);
    if (cb) cb.totalFallbacks += 1;
  }

  /**
   * 路由策略（DeepSeek + 千问双模型熔断兜底）：
   * - 用户显式指定且可路由 → 用指定的
   * - 默认主备优先级由 LLM_PRIMARY_PROVIDER 控制（默认 deepseek 优先、qwen 热备）
   * - 任一端永久禁用或熔断 OPEN 时，立即切向另一端健康 Provider
   */
  private selectProvider(params: ChatParams, preferred?: LLMProviderName): BaseLLMProvider {
    if (preferred && this.providers.has(preferred) && this.isProviderRoutable(preferred)) {
      return this.providers.get(preferred)!;
    }

    const configuredPrimary: LLMProviderName = process.env.LLM_PRIMARY_PROVIDER === 'qwen' ? 'qwen' : 'deepseek';
    const lastMessage = params.messages[params.messages.length - 1]?.content || '';
    const isCoding =
      /代码|code|implement|算法|function|class|实现|写一个/i.test(lastMessage) ||
      params.tools?.some((t) => t.function.name.includes('code'));

    const primaryOrder: LLMProviderName[] = isCoding
      ? ['deepseek', 'qwen']
      : [configuredPrimary, this.fallbackMap.get(configuredPrimary) || 'qwen'];

    for (const candidate of primaryOrder) {
      if (this.isProviderRoutable(candidate)) {
        return this.providers.get(candidate)!;
      }
    }

    throw new ServiceUnavailableException('所有模型 Provider 暂不可用或已熔断，请稍后重试');
  }

  /**
   * 解析错误状态码，区分永久错（401/403/404/402）vs 临时错
   * - 401/403:认证失败（key invalid），换 key 才能复活
   * - 402:账户余额不足，充值才能复活
   * - 404:模型不存在
   */
  private isPermanentProviderError(err: any): boolean {
    const status = err?.status ?? err?.statusCode ?? err?.response?.status;
    return status === 401 || status === 402 || status === 403 || status === 404;
  }

  /**
   * 标记 provider 永久失败
   */
  private disableProvider(name: LLMProviderName, reason: string): void {
    if (this.providerEnabled.get(name) === false) return;
    this.providerEnabled.set(name, false);
    this.providerDisabledReason.set(name, reason);
    this.logger.error(`[${name}] DISABLED permanently: ${reason}`);
  }

  /**
   * 外部调用：换 key 后重新启用（同时重置熔断器）
   */
  setProviderEnabled(name: LLMProviderName, enabled: boolean, reason?: string): void {
    this.providerEnabled.set(name, enabled);
    if (enabled) {
      this.providerDisabledReason.delete(name);
      const cb = this.circuitBreakers.get(name);
      if (cb) {
        cb.state = 'CLOSED';
        cb.consecutiveFailures = 0;
        cb.openedAt = null;
        cb.halfOpenProbeInFlight = false;
        cb.lastError = undefined;
      }
      this.logger.warn(`[${name}] re-enabled (circuit reset)`);
    } else {
      this.providerDisabledReason.set(name, reason || 'manually disabled');
      this.logger.warn(`[${name}] disabled: ${reason || 'manually'}`);
    }
  }

  getProviderStatus(): Record<string, {
    enabled: boolean;
    reason?: string;
    circuitState: CircuitState;
    consecutiveFailures: number;
    totalTrips: number;
    totalFallbacks: number;
    lastError?: string;
  }> {
    const out: Record<string, any> = {};
    for (const [k, v] of this.providerEnabled) {
      const cb = this.circuitBreakers.get(k);
      out[k] = {
        enabled: v,
        reason: this.providerDisabledReason.get(k),
        circuitState: cb?.state ?? 'CLOSED',
        consecutiveFailures: cb?.consecutiveFailures ?? 0,
        totalTrips: cb?.totalTrips ?? 0,
        totalFallbacks: cb?.totalFallbacks ?? 0,
        lastError: cb?.lastError,
      };
    }
    return out;
  }

  getConfiguredModels() {
    return Array.from(this.providers.values()).map(provider => {
      const name = provider.name as LLMProviderName;
      const cb = this.circuitBreakers.get(name);
      return {
        provider: provider.name,
        model: provider.defaultModel,
        enabled: this.providerEnabled.get(name) === true,
        circuitState: cb?.state ?? 'CLOSED',
      };
    });
  }

  private async auxiliary<T extends { promptTokens?: number }>(task: 'embedding' | 'rerank', model: string, inputBytes: number, invoke: () => Promise<T>): Promise<T> {
    requireTenant();
    if (!this.providerEnabled.get('qwen')) throw new ServiceUnavailableException('Qwen当前不可用');
    const bound = this.pricing.estimateCall({ provider: 'qwen', model, promptTokens: inputBytes, completionTokens: 0 });
    if (bound.status !== 'available' || bound.totalCny > 0.05) throw new BadRequestException('辅助模型估算费用未知或超过单次0.05CNY上限');
    const receiptId = await this.quota.reserveAuxiliary(task, model, inputBytes);
    let result: T;
    try { result = await invoke(); } catch (error) {
      await this.quota.settleAuxiliary(receiptId, { task, provider: 'qwen', model, state: 'FAILED', estimatedCostCny: null, usage: null });
      throw error;
    }
    const evidence = Number.isInteger(result.promptTokens) && result.promptTokens! > 0
      ? this.pricing.estimateCall({ provider: 'qwen', model, promptTokens: result.promptTokens!, completionTokens: 0 }) : null;
    await this.quota.settleAuxiliary(receiptId, { task, provider: 'qwen', model,
      state: evidence?.status === 'available' ? 'COMPLETED' : 'COST_UNKNOWN',
      usage: typeof result.promptTokens === 'number' ? { promptTokens: result.promptTokens, completionTokens: 0 } : null,
      estimatedCostCny: evidence?.status === 'available' ? evidence.totalCny : null,
      catalogVersion: this.pricing.version });
    if (evidence?.status !== 'available') throw new ServiceUnavailableException('辅助模型费用未知，已保留调用记录；请核查后再试');
    return result;
  }

  async embedText(text: string): Promise<number[]> {
    const result = await this.auxiliary('embedding', 'text-embedding-v3', Buffer.byteLength(text, 'utf8'), () => this.qwen.embedText(text));
    if (!Array.isArray(result.vector) || result.vector.length !== 1024 || !result.vector.every(Number.isFinite)) {
      throw new ServiceUnavailableException('Embedding返回无效向量，未写入题库');
    }
    return result.vector;
  }

  async rerank(query: string, documents: string[]): Promise<Array<{ index: number; relevance_score: number }>> {
    const bytes = documents.reduce((sum, document) => sum + Buffer.byteLength(query + document, 'utf8'), 0);
    const result = await this.auxiliary('rerank', 'gte-rerank-v2', bytes, () => this.qwen.rerank(query, documents));
    const ranks = result.rankings;
    if (!Array.isArray(ranks) || ranks.length !== documents.length || new Set(ranks.map(rank => rank.index)).size !== documents.length
      || ranks.some(rank => !Number.isInteger(rank.index) || rank.index < 0 || rank.index >= documents.length || !Number.isFinite(rank.relevance_score))) {
      throw new ServiceUnavailableException('Rerank返回无效排序，保留原始召回结果');
    }
    return ranks;
  }

  /**
   * 同步调用 - 接入 P0 缓存层
   */
  async chat(
    params: ChatParams & {
      interviewId?: string;
      userId?: string;
      semanticCacheType?: SemanticCacheType;
      allowFallback?: boolean;
    },
    preferred?: LLMProviderName,
  ): Promise<ChatResponse> {
    // ===== P0-2: 语义缓存查 =====
    const interviewId = params.interviewId || 'unknown';
    const scope = requireTenant();
    const userId = `${scope.organizationId}:${scope.userId || params.userId || 'anonymous'}`;
    const cacheType = params.semanticCacheType;
    if (params.allowFallback === false && preferred && !this.providerEnabled.get(preferred)) {
      throw new ServiceUnavailableException('所选Provider当前不可用');
    }
    const primary = this.selectProvider(params, preferred);
    const cache = cacheType ? await this.answerCacheContext(params, primary, 'chat') : undefined;

    if (cache) {
      const sem = await this.semanticCache.lookup({ cacheType, fingerprint: cache.fingerprint });
      if (sem.hit) {
        // 命中：直接构造响应（埋点 cacheHit）
        await this.recordCacheHit({
          interviewId,
          provider: 'semantic_cache',
          model: 'semantic_cache',
          promptTokens: 0,
          completionTokens: 0,
          cachedTokens: 0,
          cacheHit: true,
          isRetry: false,
          isFallback: false,
          durationMs: 0,
        });
        return {
          content: sem.cachedResponse,
          usage: { promptTokens: 0, completionTokens: 0 },
          finishReason: 'stop',
          model: `semantic_cache:${sem.cacheId}`,
          provider: 'semantic_cache',
        };
      }
    }

    const startTime = Date.now();
    let response: ChatResponse;
    let isFallback = false;
    let preparedMaxTokens: number;

    const invoke = async (provider: BaseLLMProvider, fallback: boolean) => {
      const name = provider.name as LLMProviderName;
      try {
        const res = await this.promptCache.wrapChat(
          (prepared) => this.quotaChat(provider, prepared, p => { preparedMaxTokens = p.maxTokens; }),
          { ...params, interviewId, userId, isFallback: fallback },
          { protocol: 'openai_compat', systemVersion: 'sys-v1', provider: provider.name, model: provider.defaultModel },
        );
        this.recordProviderSuccess(name);
        return res;
      } catch (err) {
        if (!(err instanceof HttpException)) {
          this.recordProviderFailure(name, err);
        }
        throw err;
      }
    };
    try {
      response = await invoke(primary, false);
    } catch (err) {
      if (err instanceof HttpException || params.allowFallback === false) throw err;
      const fallbackName = this.fallbackMap.get(primary.name as LLMProviderName);
      if (!fallbackName || !this.isProviderRoutable(fallbackName)) throw err;
      this.recordFallback(primary.name as LLMProviderName);
      isFallback = true;
      response = await invoke(this.providers.get(fallbackName)!, true);
    }

    // Langfuse 埋点（保留 v13 原有可观测）
    if (params.traceId) {
      try {
        this.langfuse.logGeneration({
        traceId: params.traceId,
        name: `llm.${primary.name}${isFallback ? '.fallback' : ''}`,
        model: response.model,
        input: { messages: params.messages },
        output: response.content,
        usage: response.usage,
        metadata: {
          finishReason: response.finishReason,
          durationMs: Date.now() - startTime,
          isFallback,
          interviewId,
        },
        });
      } catch {
        this.logger.warn({ event: 'llm_telemetry_unavailable' });
      }
    }

    // Only complete primary text answers can be replayed. A plan change during
    // reservation or a fallback must not populate the original request key.
    if (cache && !isFallback && response.finishReason === 'stop' && response.content &&
        preparedMaxTokens === cache.maxTokens) {
      this.semanticCache.setAsync({ cacheType, fingerprint: cache.fingerprint, response: response.content });
    }

    return response;
  }

  /**
   * 流式调用 - 接入 P0 缓存层
   */
  async *streamChat(
    params: ChatParams & {
      allowFallback?: boolean;
      interviewId?: string;
      userId?: string;
      semanticCacheType?: SemanticCacheType;
    },
    preferred?: LLMProviderName,
  ): AsyncGenerator<StreamChunk, void, void> {
    if (params.allowFallback === false && preferred && !this.providerEnabled.get(preferred)) {
      throw new ServiceUnavailableException('Configured provider unavailable; fallback disabled');
    }
    const interviewId = params.interviewId || 'unknown';
    const scope = requireTenant();
    const userId = `${scope.organizationId}:${scope.userId || params.userId || 'anonymous'}`;
    const cacheType = params.semanticCacheType;
    const primary = this.selectProvider(params, preferred);
    const cache = cacheType ? await this.answerCacheContext(params, primary, 'stream') : undefined;

    // Exact, complete request cache. Streaming has its own fingerprint.
    if (cache) {
      const sem = await this.semanticCache.lookup({ cacheType, fingerprint: cache.fingerprint });
      if (sem.hit) {
        await this.recordCacheHit({
          interviewId,
          provider: 'semantic_cache',
          model: 'semantic_cache',
          promptTokens: 0,
          completionTokens: 0,
          cachedTokens: 0,
          cacheHit: true,
          isRetry: false,
          isFallback: false,
          durationMs: 0,
        });
        yield { content: sem.cachedResponse };
        yield { usage: { promptTokens: 0, completionTokens: 0 }, provider: 'semantic_cache', model: `semantic_cache:${sem.cacheId}` };
        yield { finishReason: 'stop' };
        return;
      }
    }

    let totalContent = '';
    let actualProvider = primary;
    let hasEmitted = false;
    let finishReason: StreamChunk['finishReason'];
    let hasToolCall = false;
    let preparedMaxTokens: number;

    try {
      for await (const chunk of this.promptCache.wrapStream(
        (prepared) => this.quotaStream(primary, prepared, p => { preparedMaxTokens = p.maxTokens; }),
        { ...params, interviewId, userId },
        { protocol: 'openai_compat', systemVersion: 'sys-v1', provider: primary.name, model: primary.defaultModel },
      )) {
        if (chunk.content) totalContent += chunk.content;
        if (chunk.finishReason) finishReason = chunk.finishReason;
        if (chunk.toolCall) hasToolCall = true;
        if (chunk.content || chunk.toolCall || (chunk.finishReason && chunk.finishReason !== 'error')) hasEmitted = true;
        yield chunk;
      }
      this.recordProviderSuccess(primary.name as LLMProviderName);
    } catch (err) {
      if (err instanceof HttpException) throw err;
      this.recordProviderFailure(primary.name as LLMProviderName, err);
      // 已输出文本、工具调用或终态后不得重放另一模型，避免重复/混合回答。
      if (hasEmitted) throw err;
      const fallbackName = this.fallbackMap.get(primary.name as LLMProviderName);
      if (params.allowFallback !== false && fallbackName && this.isProviderRoutable(fallbackName)) {
        this.recordFallback(primary.name as LLMProviderName);
        const fallback = this.providers.get(fallbackName)!;
        actualProvider = fallback;
        totalContent = '';
        try {
          for await (const chunk of this.promptCache.wrapStream(
            (prepared) => this.quotaStream(fallback, prepared),
            { ...params, interviewId, userId, isFallback: true },
            { protocol: 'openai_compat', systemVersion: 'sys-v1', provider: fallback.name, model: fallback.defaultModel },
          )) {
            if (chunk.content) totalContent += chunk.content;
            yield chunk;
          }
          this.recordProviderSuccess(fallback.name as LLMProviderName);
        } catch (fallbackError) {
          if (!(fallbackError instanceof HttpException)) {
            this.recordProviderFailure(fallback.name as LLMProviderName, fallbackError);
          }
          throw fallbackError;
        }
      } else {
        throw err;
      }
    }

    if (cache && actualProvider === primary && finishReason === 'stop' && !hasToolCall &&
        totalContent && preparedMaxTokens === cache.maxTokens) {
      this.semanticCache.setAsync({ cacheType, fingerprint: cache.fingerprint, response: totalContent });
    }
  }

  private async answerCacheContext(
    params: ChatParams & { interviewId?: string }, provider: BaseLLMProvider, mode: 'chat' | 'stream',
  ): Promise<{ fingerprint: string; maxTokens: number } | undefined> {
    const scope = requireTenant();
    // Never accept a caller-supplied identity as the cache security boundary.
    if (!scope.userId || scope.quotaFailure || params.tools?.length || params.responseFormat) return;
    try {
      const limits = await this.quota.getAnswerCacheLimits();
      const fingerprint = answerCacheFingerprint(params,
        { organizationId: scope.organizationId, userId: scope.userId },
        { name: provider.name, defaultModel: provider.defaultModel, revision: process.env.ANSWER_CACHE_REVISION || 'initial-v2' }, limits, mode);
      if (fingerprint) return { fingerprint, maxTokens: Math.min(params.maxTokens ?? limits.maxOutputTokens, limits.maxOutputTokens) };
    } catch {
      this.logger.debug({ event: 'answer_cache_policy_unavailable' });
    }
  }

  private async quotaChat(provider: BaseLLMProvider, params: ChatParams, onPrepared?: (p: ChatParams) => void) {
    const prepared = await this.quota.reserveLlm(params);
    onPrepared?.(prepared);
    return provider.chat(prepared);
  }

  private async *quotaStream(provider: BaseLLMProvider, params: ChatParams, onPrepared?: (p: ChatParams) => void): AsyncGenerator<StreamChunk, void, void> {
    const prepared = await this.quota.reserveLlm(params);
    onPrepared?.(prepared);
    yield* provider.streamChat(prepared);
  }

  private async recordCacheHit(metric: Parameters<SessionCostTracker['recordLlmCall']>[0]): Promise<void> {
    try {
      await this.costTracker.recordLlmCall(metric);
    } catch {
      this.logger.warn({ event: 'cache_hit_metric_unavailable' });
    }
  }

  /** 启动新会话：预热 cost row */
  async startSession(interviewId: string, userId: string): Promise<void> {
    await this.costTracker.startSession(interviewId);
    this.logger.log(`Session cost tracking started: ${interviewId} (user=${userId})`);
  }

  /** 结束会话：刷盘 */
  async endSession(interviewId: string): Promise<void> {
    await this.costTracker.endSession(interviewId);
  }

}
