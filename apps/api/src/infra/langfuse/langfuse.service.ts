import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Langfuse } from 'langfuse';
type Generation = any;

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
   * 采样判断：使用确定性 hash（基于 traceId/name）保证同一请求内
   * trace / span / generation 采样决策一致，避免 trace 被采样但 span
   * 未被采样导致 Langfuse 上看到"有 trace 无 span"的不完整 trace 树。
   *
   * R-P2-11 修复：原 Math.random() 不可复现，同一请求重试时采样结果不同，
   * 导致 trace 数据碎片化。改用 hash(seed) % 100 < rate*100 决策。
   *
   * 商用：如果需要严格概率采样可保留 Math.random()，但需配合 traceId
   * 关联字段保证 trace 完整性。
   */
  private shouldSample(type: 'trace' | 'span' | 'generation', seed?: string): boolean {
    const rate = this.sampleRate[type];
    if (rate >= 1) return true;
    if (rate <= 0) return false;
    if (!seed) {
      // 没传 seed 时回退到随机（不推荐，会失去一致性）
      return Math.random() < rate;
    }
    // 简单 hash：djb2 算法
    let hash = 5381;
    for (let i = 0; i < seed.length; i++) {
      hash = ((hash << 5) + hash) + seed.charCodeAt(i);
      hash = hash & hash; // 32-bit
    }
    const normalized = Math.abs(hash) / 0x7fffffff; // 0-1
    return normalized < rate;
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
    // R-P2-11 第二轮：传 seed 让采样决策确定性。
    // seed = name + sessionId，保证同一请求 trace 决策一致；
    // 重试时同 seed 走同一条采样路径（trace 包含/不包含）。
    const traceSeed = `${params.name}|${params.sessionId ?? ''}|${params.userId ?? ''}`;
    if (!this.shouldSample('trace', traceSeed)) {
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
    // R-P1-8 修复：traceId 缺失时早返回（与 logSpan/logToolCall 一致），
    // 避免 Langfuse SDK 生成 orphan generation 然后静默丢弃。
    if (!this.client || !params.traceId) return;
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
    // R-P1-8 修复：traceId 缺失（trace 被采样跳过）时早返回，不再调 Langfuse
    // client 传 undefined traceId（之前会生成 orphan generation 然后静默丢）。
    if (!this.client || !params.traceId) return;
    // R-P2-11 修复：traceId 存在时跟随 trace 上报，不再独立采样。
    // 原 shouldSample('span') 会让同一 trace 下的 span 被独立采样，导致
    // trace 树不完整（trace 有但 span 缺失）。
    this.client.span({
      traceId: params.traceId,
      name: params.name,
      input: params.input,
      output: params.output,
      metadata: params.metadata,
    });
  }

  /**
   * 记录工具调用
   */
  logToolCall(params: {
    traceId: string;
    name: string;
    input?: any;
    output?: any;
    metadata?: Record<string, any>;
    error?: string;
  }) {
    // R-P1-8 修复：traceId 缺失时早返回（与 logSpan 一致）
    if (!this.client || !params.traceId) return;
    // R-P2-11 修复：跟随 trace 上报，不再独立采样
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
