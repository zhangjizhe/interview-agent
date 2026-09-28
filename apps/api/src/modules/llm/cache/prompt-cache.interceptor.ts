/**
 * Prompt Cache 拦截器
 *
 * 挂在 LLM Gateway 的 chat / streamChat 上：
 *  - 入站：根据 messages 自动分类 3 段、生成 prompt_cache_key、注入 cache_control
 *  - 出站：从 response.usage 提取 cached_tokens、埋点 SessionCost
 *
 * 实现方式：把它包成函数式 wrapper，不动 LlmGatewayService 现有签名
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatParams, ChatResponse, StreamChunk } from '../providers/types';
import {
  buildPromptCacheContext,
  extractCacheUsage,
  injectAnthropicCacheControl,
  type CacheProtocol,
  type PromptCacheContext,
} from './prompt-cache.strategy';
import { SessionCostTracker } from '../cost/session-cost.tracker';

export interface CacheWrapOptions {
  /** provider 协议族（v13 当前全 openai_compat，留接口接 Anthropic） */
  protocol: CacheProtocol;
  /** system prompt 版本号，部署升级时改这个强制失效缓存 */
  systemVersion: string;
  provider?: string;
  model?: string;
}

@Injectable()
export class PromptCacheInterceptor {
  private readonly logger = new Logger(PromptCacheInterceptor.name);
  private defaultSystemVersion: string;

  constructor(
    private config: ConfigService,
    private cost: SessionCostTracker,
  ) {
    this.defaultSystemVersion =
      this.config.get<string>('promptCache.systemVersion') || 'sys-v1';
  }

  /**
   * 包装 LLM 调用：
   *  1. 语义缓存查（按 cacheType 决策，调用方传）
   *  2. prompt cache 上下文构造
   *  3. 调用底层 provider
   *  4. 记录埋点
   */
  async wrapChat(
    call: (prepared: ChatParams) => Promise<ChatResponse>,
    params: ChatParams & {
      interviewId: string;
      userId: string;
      isRetry?: boolean;
      isFallback?: boolean;
    },
    opts: CacheWrapOptions,
    semanticResult?: { hit: boolean; cacheId?: string },
  ): Promise<ChatResponse> {
    const ctx = buildPromptCacheContext({
      userId: params.userId,
      systemVersion: opts.systemVersion || this.defaultSystemVersion,
      messages: params.messages,
      tools: params.tools,
      protocol: opts.protocol,
    });

    // Anthropic 协议：把 cache_control 注入 messages
    if (opts.protocol === 'anthropic' && ctx.cacheableIndices.length > 0) {
      params.messages = injectAnthropicCacheControl(params.messages as any, ctx.cacheableIndices) as any;
    }

    // OpenAI 兼容：prompt_cache_key 走 query / header
    // Qwen / DeepSeek 通过 extra_body 传
    if (opts.protocol === 'openai_compat' && ctx.cacheableIndices.length > 0) {
      (params as any).__promptCacheKey = ctx.promptCacheKey;
    }

    const start = Date.now();
    let response: ChatResponse;
    try {
      response = await call(params);
    } catch (err) {
      await this.recordMetric({
        interviewId: params.interviewId,
        provider: opts.provider || 'unknown',
        model: opts.model || 'unknown',
        promptTokens: 0,
        completionTokens: 0,
        cachedTokens: 0,
        cacheHit: false,
        isRetry: !!params.isRetry,
        isFallback: !!params.isFallback,
        isError: true,
        durationMs: Date.now() - start,
      });
      throw err;
    }

    const usage = extractCacheUsage(response.usage);
    await this.recordMetric({
      interviewId: params.interviewId,
      provider: opts.provider || response.model,
      model: response.model,
      promptTokens: response.usage.promptTokens,
      completionTokens: response.usage.completionTokens,
      cachedTokens: usage.cachedTokens,
      cacheHit: !!semanticResult?.hit,
      isRetry: !!params.isRetry,
      isFallback: !!params.isFallback,
      durationMs: Date.now() - start,
    });

    return response;
  }

  /**
   * 流式版本 - 用法和同步类似，但埋点延迟到流结束
   */
  async *wrapStream(
    call: (prepared: ChatParams) => AsyncGenerator<StreamChunk, void, void>,
    params: ChatParams & { interviewId: string; userId: string; isFallback?: boolean },
    opts: CacheWrapOptions,
    semanticResult?: { hit: boolean; cacheId?: string },
  ): AsyncGenerator<StreamChunk, void, void> {
    const ctx = buildPromptCacheContext({
      userId: params.userId,
      systemVersion: opts.systemVersion || this.defaultSystemVersion,
      messages: params.messages,
      tools: params.tools,
      protocol: opts.protocol,
    });

    if (opts.protocol === 'anthropic' && ctx.cacheableIndices.length > 0) {
      params.messages = injectAnthropicCacheControl(params.messages as any, ctx.cacheableIndices) as any;
    }
    if (opts.protocol === 'openai_compat' && ctx.cacheableIndices.length > 0) {
      (params as any).__promptCacheKey = ctx.promptCacheKey;
    }

    const start = Date.now();
    let totalContent = '';
    let usage: any;
    const model = opts.model || 'unknown';
    let success = false;
    let errored = false;
    let promptTokens = 0;
    let completionTokens = 0;

    try {
      for await (const chunk of call(params)) {
        if (chunk.content) totalContent += chunk.content;
        if (chunk.usage) {
          usage = chunk.usage;
          promptTokens = usage.promptTokens || 0;
          completionTokens = usage.completionTokens || 0;
        }
        if (chunk.finishReason === 'error') throw new Error('Provider reported a stream error');
        if (chunk.finishReason === 'stop' || chunk.finishReason === 'length' || chunk.finishReason === 'tool_calls') success = true;
        yield chunk;
      }
      if (!success) throw new Error('Provider stream ended without a completion event');
      if (usage) {
        promptTokens = usage.promptTokens || 0;
        completionTokens = usage.completionTokens || 0;
      }
    } catch (err) {
      errored = true;
      throw err;
    } finally {
      // 流式埋点
      const u = extractCacheUsage(usage);
      await this.recordMetric({
        interviewId: params.interviewId,
        provider: opts.provider || model,
        model,
        promptTokens,
        completionTokens,
        cachedTokens: u.cachedTokens,
        cacheHit: !!semanticResult?.hit,
        isRetry: false,
        isFallback: !!params.isFallback,
        isError: errored,
        durationMs: Date.now() - start,
      });
    }
  }

  // 成本遥测失败不能把已经成功的模型调用变成失败或触发 fallback。
  private async recordMetric(metric: Parameters<SessionCostTracker['recordLlmCall']>[0]): Promise<void> {
    try {
      await this.cost.recordLlmCall(metric);
    } catch {
      this.logger.warn({ event: 'cost_metric_unavailable', provider: metric.provider });
    }
  }

  /** 工具方法：让外部读 ctx（用于测试） */
  buildContext(params: ChatParams & { userId: string }, opts: CacheWrapOptions): PromptCacheContext {
    return buildPromptCacheContext({
      userId: params.userId,
      systemVersion: opts.systemVersion || this.defaultSystemVersion,
      messages: params.messages,
      tools: params.tools,
      protocol: opts.protocol,
    });
  }
}
