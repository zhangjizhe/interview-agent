import { Injectable, Logger } from '@nestjs/common';
import { QwenProvider } from './providers/qwen.provider';
import { DeepseekProvider } from './providers/deepseek.provider';
import { BaseLLMProvider } from './providers/base.provider';
import { LangfuseService } from '../../infra/langfuse/langfuse.service';
import { ChatParams, ChatResponse, LLMProviderName, StreamChunk } from './providers/types';
import { PromptCacheInterceptor } from './cache/prompt-cache.interceptor';
import { SemanticCacheService, SemanticCacheType } from './cache/semantic-cache.service';
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
 *  6. Semantic Cache（白名单场景：interview_question 命中直接返回）
 *  7. 会话级成本埋点
 *
 * Bug 修复：Provider 永久错（401/403/404）检测
 *  - 401/403 = 认证失败,key 错了,fallback 没意义,直接标 dead
 *  - 404 = 模型不存在
 *  - 5xx / 429 = 临时错,走 fallback
 *  - 进程级 disabled 状态,新 key 后用 setProviderEnabled 重新启用
 */
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

  constructor(
    private qwen: QwenProvider,
    private deepseek: DeepseekProvider,
    private langfuse: LangfuseService,
    private promptCache: PromptCacheInterceptor,
    private semanticCache: SemanticCacheService,
    private costTracker: SessionCostTracker,
  ) {
    this.providers = new Map<LLMProviderName, BaseLLMProvider>([
      ['qwen', this.qwen],
      ['deepseek', this.deepseek],
    ]);
  }

  /**
   * 路由策略：
   * - 代码 / 技术题 → DeepSeek
   * - 通用对话 / 评估 → Qwen
   * - 用户显式指定 → 用指定的
   */
  private selectProvider(params: ChatParams, preferred?: LLMProviderName): BaseLLMProvider {
    if (preferred && this.providers.has(preferred)) {
      // 优先 provider 如果被 disabled,降级选可用的
      if (this.providerEnabled.get(preferred)) {
        return this.providers.get(preferred);
      }
    }

    // 简易意图识别
    const lastMessage = params.messages[params.messages.length - 1]?.content || '';
    const isCoding =
      /代码|code|implement|算法|function|class|实现|写一个/i.test(lastMessage) ||
      params.tools?.some((t) => t.function.name.includes('code'));

    return isCoding ? this.deepseek : this.qwen;
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
   * 外部调用：换 key 后重新启用
   */
  setProviderEnabled(name: LLMProviderName, enabled: boolean, reason?: string): void {
    this.providerEnabled.set(name, enabled);
    if (enabled) {
      this.providerDisabledReason.delete(name);
      this.logger.warn(`[${name}] re-enabled`);
    } else {
      this.providerDisabledReason.set(name, reason || 'manually disabled');
      this.logger.warn(`[${name}] disabled: ${reason || 'manually'}`);
    }
  }

  getProviderStatus(): Record<string, { enabled: boolean; reason?: string }> {
    const out: Record<string, { enabled: boolean; reason?: string }> = {};
    for (const [k, v] of this.providerEnabled) {
      out[k] = { enabled: v, reason: this.providerDisabledReason.get(k) };
    }
    return out;
  }

  /**
   * 同步调用 - 接入 P0 缓存层
   */
  async chat(
    params: ChatParams & {
      interviewId?: string;
      userId?: string;
      semanticCacheType?: SemanticCacheType;
    },
    preferred?: LLMProviderName,
  ): Promise<ChatResponse> {
    // ===== P0-2: 语义缓存查 =====
    const interviewId = params.interviewId || 'unknown';
    const userId = params.userId || 'anonymous';
    const cacheType = params.semanticCacheType;

    if (cacheType) {
      const lastUserMsg = [...params.messages].reverse().find((m) => m.role === 'user');
      const queryText = lastUserMsg?.content || '';
      const sem = await this.semanticCache.lookup({
        userId,
        cacheType,
        query: queryText,
      });
      if (sem.hit) {
        // 命中：直接构造响应（埋点 cacheHit）
        await this.costTracker.recordLlmCall({
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
        };
      }
    }

    const primary = this.selectProvider(params, preferred);
    const startTime = Date.now();
    let response: ChatResponse;
    let isFallback = false;

    try {
      // ===== P0-1: prompt cache 包装 =====
      response = await this.promptCache.wrapChat(
        () => primary.chat(params),
        { ...params, interviewId, userId },
        { protocol: 'openai_compat', systemVersion: 'sys-v1' },
      );
    } catch (err) {
      // 永久错（401/403/404）= provider 死了，直接标 disabled 再抛
      if (this.isPermanentProviderError(err)) {
        this.disableProvider(primary.name as LLMProviderName, err?.message || 'permanent error');
        // 找下一个可用的
        const fallbackName = this.fallbackMap.get(primary.name as LLMProviderName);
        if (fallbackName && this.providerEnabled.get(fallbackName)) {
          const fallback = this.providers.get(fallbackName);
          isFallback = true;
          response = await this.promptCache.wrapChat(
            () => fallback.chat(params),
            { ...params, interviewId, userId, isFallback: true },
            { protocol: 'openai_compat', systemVersion: 'sys-v1' },
          );
        } else {
          throw err;
        }
      } else {
        // 临时错（5xx / 429 / 网络）正常 fallback
        this.logger.warn(`[${primary.name}] failed (transient), fallback...`);
        const fallbackName = this.fallbackMap.get(primary.name as LLMProviderName);
        if (fallbackName && this.providerEnabled.get(fallbackName)) {
          const fallback = this.providers.get(fallbackName);
          isFallback = true;
          response = await this.promptCache.wrapChat(
            () => fallback.chat(params),
            { ...params, interviewId, userId, isFallback: true },
            { protocol: 'openai_compat', systemVersion: 'sys-v1' },
          );
        } else {
          throw err;
        }
      }
    }

    // Langfuse 埋点（保留 v13 原有可观测）
    if (params.traceId) {
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
    }

    // ===== P0-2: 异步写语义缓存 =====
    if (cacheType && response.content) {
      const lastUserMsg = [...params.messages].reverse().find((m) => m.role === 'user');
      this.semanticCache.setAsync({
        userId,
        cacheType,
        query: lastUserMsg?.content || '',
        response: response.content,
        metadata: { interviewId, model: response.model },
      });
    }

    return response;
  }

  /**
   * 流式调用 - 接入 P0 缓存层
   */
  async *streamChat(
    params: ChatParams & {
      interviewId?: string;
      userId?: string;
      semanticCacheType?: SemanticCacheType;
    },
    preferred?: LLMProviderName,
  ): AsyncGenerator<StreamChunk, void, void> {
    const interviewId = params.interviewId || 'unknown';
    const userId = params.userId || 'anonymous';
    const cacheType = params.semanticCacheType;

    // 语义缓存查（流式命中直接 yield 整段）
    if (cacheType) {
      const lastUserMsg = [...params.messages].reverse().find((m) => m.role === 'user');
      const queryText = lastUserMsg?.content || '';
      const sem = await this.semanticCache.lookup({
        userId,
        cacheType,
        query: queryText,
      });
      if (sem.hit) {
        await this.costTracker.recordLlmCall({
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
        yield { finishReason: 'stop' };
        return;
      }
    }

    const primary = this.selectProvider(params, preferred);
    const startTime = Date.now();
    let totalContent = '';
    let isFallback = false;

    try {
      for await (const chunk of this.promptCache.wrapStream(
        () => primary.streamChat(params),
        { ...params, interviewId, userId },
        { protocol: 'openai_compat', systemVersion: 'sys-v1' },
      )) {
        if (chunk.content) totalContent += chunk.content;
        yield chunk;
      }
    } catch (err) {
      // 永久错 vs 临时错同样处理
      if (this.isPermanentProviderError(err)) {
        this.disableProvider(primary.name as LLMProviderName, err?.message || 'permanent error');
      } else {
        this.logger.warn(`[${primary.name}] stream failed, fallback...`);
      }
      const fallbackName = this.fallbackMap.get(primary.name as LLMProviderName);
      if (fallbackName && this.providerEnabled.get(fallbackName)) {
        const fallback = this.providers.get(fallbackName);
        isFallback = true;
        totalContent = '';
        for await (const chunk of this.promptCache.wrapStream(
          () => fallback.streamChat(params),
          { ...params, interviewId, userId, isFallback: true },
          { protocol: 'openai_compat', systemVersion: 'sys-v1' },
        )) {
          if (chunk.content) totalContent += chunk.content;
          yield chunk;
        }
      } else {
        throw err;
      }
    }

    // 异步写语义缓存
    if (cacheType && totalContent) {
      const lastUserMsg = [...params.messages].reverse().find((m) => m.role === 'user');
      this.semanticCache.setAsync({
        userId,
        cacheType,
        query: lastUserMsg?.content || '',
        response: totalContent,
        metadata: { interviewId, model: primary.name },
      });
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

  /**
   * 启动时 health check：每个 provider 试一次，永久错立即 disable
   * 非阻塞：失败也不影响模块启动
   */
  async healthCheckProviders(): Promise<void> {
    for (const [name, provider] of this.providers) {
      try {
        await provider.chat({
          messages: [{ role: 'user', content: 'ping' }],
          maxTokens: 1,
          temperature: 0,
        });
        this.logger.log(`[${name}] health check OK`);
      } catch (err: any) {
        if (this.isPermanentProviderError(err)) {
          this.disableProvider(name, `health check failed: ${err?.message}`);
        } else {
          this.logger.warn(`[${name}] health check transient: ${err?.message}`);
        }
      }
    }
  }
}
