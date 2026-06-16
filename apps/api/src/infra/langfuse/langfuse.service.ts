import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Langfuse } from 'langfuse';

/**
 * Langfuse 可观测服务
 * - Trace: 一次完整请求
 * - Span: 子操作（如"记忆召回"）
 * - Generation: LLM 调用（自动算 token 成本）
 */
@Injectable()
export class LangfuseService implements OnModuleInit {
  private readonly logger = new Logger(LangfuseService.name);
  private client: Langfuse;

  constructor(private config: ConfigService) {}

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
    this.logger.log(`✅ Langfuse connected to ${baseUrl}`);
  }

  /**
   * 开始一个 trace
   */
  startTrace(params: {
    name: string;
    userId?: string;
    sessionId?: string;
    metadata?: Record<string, any>;
  }) {
    if (!this.client) return null;
    return this.client.trace({
      name: params.name,
      userId: params.userId,
      sessionId: params.sessionId,
      metadata: params.metadata,
    });
  }

  /**
   * 记录 LLM 调用
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
   * 记录 Span
   */
  logSpan(params: {
    traceId: string;
    name: string;
    input?: any;
    output?: any;
    metadata?: Record<string, any>;
  }) {
    if (!this.client) return;
    this.client.span({
      traceId: params.traceId,
      name: params.name,
      input: params.input,
      output: params.output,
      metadata: params.metadata,
    });
  }

  /**
   * 异步上报（关键：进程退出前必须调）
   */
  async flush() {
    if (!this.client) return;
    await this.client.flushAsync();
  }
}
