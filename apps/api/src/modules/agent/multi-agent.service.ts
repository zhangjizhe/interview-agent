/**
 * Multi-Agent 适配服务 - 把 LangGraph StateGraph 包成 NestJS 可注入的 service
 *
 * 关键能力：
 * - **Checkpointer (PostgresSaver)**：图状态持久化到 PG，支持断点续跑 / 多轮历史自动恢复 / thread_id 隔离多用户
 * - **thread_id**：以 interviewId 为 key，每个面试一个独立的对话线程
 */
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, type BaseMessage, type BaseMessageLike } from '@langchain/core/messages';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import type { RunnableConfig } from '@langchain/core/runnables';
import {
  buildInterviewGraph,
  type InterviewAgentStateType,
} from '../../agents/multi-agent/graph';
import { LlmGatewayService } from '../llm/llm.gateway.service';

@Injectable()
export class MultiAgentService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MultiAgentService.name);
  private graph: ReturnType<typeof buildInterviewGraph> | null = null;
  private checkpointer: BaseCheckpointSaver | null = null;
  private checkpointerSetupDone = false;
  private enabled = false;

  constructor(
    private config: ConfigService,
    private llm: LlmGatewayService,
  ) {}

  async onModuleInit() {
    // 开关：默认开启 multi-agent
    const flag = this.config.get<string>('multiAgent.enabled');
    if (flag === 'false') {
      this.logger.warn('MultiAgent disabled by env');
      return;
    }
    try {
      const qwenKey = this.config.get<string>('qwen.apiKey');
      const qwenBase = this.config.get<string>('qwen.baseUrl');
      const modelName = this.config.get<string>('qwen.model') || 'qwen-plus';

      const model = new ChatOpenAI({
        modelName,
        apiKey: qwenKey,
        configuration: { baseURL: qwenBase },
        temperature: 0.7,
      });

      // Checkpointer: PostgresSaver 持久化到 PG（thread_id 隔离）
      // 复用现有 Prisma DATABASE_URL（pgvector 容器同源）
      const connString =
        this.config.get<string>('database.url') ||
        'postgresql://dev:dev123@postgres:5432/interview';

      try {
        this.checkpointer = PostgresSaver.fromConnString(connString, {
          schema: 'public',
        });
        // 第一次使用要 setup() 创建 checkpoint 表
        await (this.checkpointer as any).setup();
        this.checkpointerSetupDone = true;
        this.logger.log(`✅ PostgresSaver ready (${connString.replace(/:[^:@]+@/, ':***@')})`);
      } catch (cpErr: any) {
        this.logger.error(
          `PostgresSaver init failed, falling back to no-checkpoint: ${cpErr.message}`,
        );
        this.checkpointer = null;
      }

      this.graph = buildInterviewGraph(model, this.checkpointer || undefined);
      this.enabled = true;
      this.logger.log(
        `✅ MultiAgent graph compiled (model=${modelName}, checkpoint=${this.checkpointer ? 'postgres' : 'none'})`,
      );
    } catch (err: any) {
      this.logger.error(`MultiAgent init failed: ${err.message}`);
    }
  }

  async onModuleDestroy() {
    // PostgresSaver 在 langgraph 1.4 里有 close() 方法
    try {
      await (this.checkpointer as any)?.close?.();
    } catch {}
  }

  isEnabled() {
    return this.enabled;
  }

  /**
   * 同步调用 - 用 thread_id 隔离多用户/多面试
   * 第二次调用相同 thread 会自动从 checkpoint 恢复 state.messages
   */
  async run(
    userMessage: string,
    threadId: string,
    history: BaseMessageLike[] = [],
  ) {
    if (!this.graph) throw new Error('MultiAgent not initialized');
    const config: RunnableConfig = {
      configurable: { thread_id: threadId },
    };

    // 只有第一次传 messages，后续会自动从 checkpoint 恢复
    // 但保险起见，如果 thread_id 是新的（first turn），仍传 messages
    const isFirstTurn = history.length === 0;
    const input: Partial<InterviewAgentStateType> = isFirstTurn
      ? { messages: [new HumanMessage(userMessage)] }
      : { messages: [new HumanMessage(userMessage)] }; // 简化：始终传新 message，langgraph 会 append

    const result = await this.graph.invoke(input as any, config);

    return {
      response: (result as any).final_response || '',
      intent: (result as any).user_intent,
      plan: (result as any).plan,
      pastSteps: (result as any).past_steps,
      steps: ((result as any).past_steps || []).length,
      threadId,
    };
  }

  /**
   * 流式调用 - 用于 SSE
   */
  async *stream(
    userMessage: string,
    threadId: string,
  ): AsyncGenerator<any, void, unknown> {
    if (!this.graph) throw new Error('MultiAgent not initialized');
    const config: RunnableConfig = {
      configurable: { thread_id: threadId },
    };

    const stream = await this.graph.stream(
      { messages: [new HumanMessage(userMessage)] } as any,
      { ...config, streamMode: 'values' as const },
    );

    for await (const chunk of stream) {
      const messages = (chunk as any).messages || [];
      const last = messages[messages.length - 1];
      if (last && last.content) {
        yield {
          type: 'token',
          content: typeof last.content === 'string' ? last.content : JSON.stringify(last.content),
        };
      }
      if ((chunk as any).final_response) {
        yield { type: 'final_response', content: (chunk as any).final_response };
      }
    }
  }

  /**
   * 取 thread 状态（用于断点续跑/历史回放）
   */
  async getState(threadId: string) {
    if (!this.graph) return null;
    try {
      const state = await this.graph.getState({ configurable: { thread_id: threadId } });
      return state;
    } catch (err: any) {
      this.logger.warn(`getState failed: ${err.message}`);
      return null;
    }
  }

  /**
   * 列出所有 thread 的 checkpoint 历史
   */
  async listCheckpoints(threadId: string) {
    if (!this.checkpointer) return [];
    try {
      const listFn = (this.checkpointer as any).list;
      if (!listFn) return [];
      const items: any[] = [];
      for await (const cp of listFn.call(this.checkpointer, {
        configurable: { thread_id: threadId },
      })) {
        items.push(cp);
      }
      return items;
    } catch (err: any) {
      this.logger.warn(`listCheckpoints failed: ${err.message}`);
      return [];
    }
  }
}