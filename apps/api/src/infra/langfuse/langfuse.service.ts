import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Langfuse, Generation } from 'langfuse';

/**
 * Langfuse 可观测服务
 * - Trace: 一次完整请求
 * - Span: 子操作（如"记忆召回"）
 * - Generation: LLM 调用（自动算 token 成本）
 *
 * 采样策略（P1-6 修复）：
 * - trace（完整流程）10% 采样
 * - span（中间节点）50%
 * - generation（LLM 调用）100%（成本数据必须完整）
 */
@Injectable()
export class LangfuseService implements OnModuleInit {
  private readonly logger = new Logger(LangfuseService.name);
  private client: Langfuse;

  // P1-6 修复：采样率配置
  private sampleRate = {
    trace: 0.1,      // 10%
    span: 0.5,       // 50%
    generation: 1.0, // 100%（不能丢，成本分析需要）
  };

  constructor(private config: ConfigService) {
    // 从配置读取采样率（环境变量覆盖默认值）
    this.sampleRate = {
      trace: this.config.get<number>('langfuse.sampleRate.trace') ?? 0.1,
      span: this.config.get<number>('langfuse.sampleRate.span') ?? 0.5,
      generation: this.config.get<number>('langfuse.sampleRate.generation') ?? 1.0,
    };
  }

  onModuleInit() {
    const publicKey = this.config.get<string>('langfuse.publicKey');
    const secretKey = this.config.get<string>('langfuse.secretKey');
    const baseUrl = this.config.get<string>('langfuse.baseUrl');
    if (!publicKey || !secretKey) {
      this.logger.warn('⚠️  Langfuse credentials missing, observability disabled');
      return;
    }

    this.client = new Langfuse({
      publicKey,
      secretKey,
      baseUrl,
    });
    this.logger.log(`✅ Langfuse connected to ${baseUrl} (sampling: trace=${this.sampleRate.trace}, span=${this.sampleRate.span}, generation=${this.sampleRate.generation})`);
  }

  /**
   * 采样判断
   */
  private shouldSample(type: 'trace' | 'span' | 'generation'): boolean {
    const rate = this.sampleRate[type];
    return Math.random() < rate;
  }

  /**
   * 开始一个 trace（10% 采样）
   */
  startTrace(params: {
    name: string;
    userId?: string;
    sessionId?: string;
    metadata?: Record<string, any>;
  }) {
    // P1-6 修复：按采样率决定是否上报
    if (!this.client) return null;
    if (!this.shouldSample('trace')) {
      return null; // 跳过不上报
    }
    return this.client.trace({
      name: params.name,
      userId: params.userId,
      sessionId: params.sessionId,
      metadata: params.metadata,
    });
  }

  /**
   * 创建一个 generation 记录（返回对象用于后续更新）
   * generation 永远 100% 采样（成本数据必须完整）
   */
  createGeneration(params: {
    traceId: string;
    name: string;
    model: string;
    input: any;
    metadata?: Record<string, any>;
  }): Generation | null {
    if (!this.client) return null;
    return this.client.generation({
      traceId: params.traceId,
      name: params.name,
      model: params.model,
      input: params.input,
      metadata: params.metadata,
    });
  }

  /**
   * 更新 generation 的 usage（Token 计量）
   */
  updateGenerationUsage(generation: Generation, usage: { promptTokens: number; completionTokens: number }): void {
    if (!this.client || !generation) return;
    generation.update({
      usage: {
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.promptTokens + usage.completionTokens,
      },
    });
  }

  /**
   * 更新 generation 的 output
   */
  updateGenerationOutput(generation: Generation, output: any): void {
    if (!this.client || !generation) return;
    generation.update({ output });
  }

  /**
   * 记录 LLM 调用（一次性完成，100% 采样）
   */
  logGeneration(params: {
    traceId: string;
    name: string;
    model: string;
    input: any;
    output: any;
    usage?: { promptTokens: number; completionTokens: number };
    metadata?: Record<string, any>;
  }) {
    if (!this.client) return;
    this.client.generation({
      traceId: params.traceId,
      name: params.name,
      model: params.model,
      input: params.input,
      output: params.output,
      usage: params.usage,
      metadata: params.metadata,
    });
  }

  /**
   * 记录 Span（50% 采样）
   */
  logSpan(params: {
    traceId: string;
    name: string;
    input?: any;
    output?: any;
    metadata?: Record<string, any>;
  }) {
    if (!this.client) return;
    if (!this.shouldSample('span')) {
      return; // 跳过不上报
    }
    this.client.span({
      traceId: params.traceId,
      name: params.name,
      input: params.input,
      output: params.output,
      metadata: params.metadata,
    });
  }

  /**
   * 记录工具调用（50% 采样）
   */
  logToolCall(params: {
    traceId: string;
    name: string;
    input?: any;
    output?: any;
    metadata?: Record<string, any>;
    error?: string;
  }) {
    if (!this.client) return;
    if (!this.shouldSample('span')) {
      return; // 跳过不上报
    }
    this.client.span({
      traceId: params.traceId,
      name: `tool.${params.name}`,
      input: params.input,
      output: params.error ? { error: params.error } : params.output,
      metadata: {
        ...params.metadata,
        error: !!params.error,
      },
    });
  }

  /**
   * 异步上报（关键：进程退出前必须调）
   */
  async flush() {
    if (!this.client) return;
    await this.client.flushAsync();
  }

  /**
   * 检查 Langfuse 是否启用
   */
  isEnabled(): boolean {
    return !!this.client;
  }

  /**
   * 获取当前采样率配置（用于可观测）
   */
  getSampleRates() {
    return { ...this.sampleRate };
  }
}
