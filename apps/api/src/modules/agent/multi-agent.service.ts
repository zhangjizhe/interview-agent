/**
 * Multi-Agent 适配服务 - 把 LangGraph StateGraph 包成 NestJS 可注入的 service
 *
 * 关键能力：
 * - **Checkpointer (PostgresSaver)**：图状态持久化到 PG，支持断点续跑 / 多轮历史自动恢复 / thread_id 隔离多用户
 * - **Tool Runtime Binding**：将 BochaSearchTool / MemoryService / KnowledgeBaseService 注入 McpRegistry，让 executor 能真实调用工具
 * - **LlmGateway Integration**：通过 LlmGatewayChatModel 包装器接入 LlmGatewayService，享受缓存、故障降级、成本追踪能力
 */
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HumanMessage, type BaseMessageLike } from '@langchain/core/messages';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import type { RunnableConfig } from '@langchain/core/runnables';
import { Command } from '@langchain/langgraph';
import {
  buildInterviewGraph,
  type InterviewAgentStateType,
} from '../../agents/multi-agent/graph';
import { LlmGatewayChatModel } from '../../agents/multi-agent/llm-gateway-chat-model';
import { LlmGatewayService } from '../llm/llm.gateway.service';
import { BochaSearchTool } from './tools/bocha-search.tool';
import { MemoryService } from '../memory/memory.service';
import { KnowledgeBaseService } from '../knowledge-base/knowledge-base.service';
import { McpRegistry } from '../interview/services/mcp-registry';

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
    private bocha: BochaSearchTool,
    private memory: MemoryService,
    private kb: KnowledgeBaseService,
  ) {}

  async onModuleInit() {
    // ===== Step 1: 把真实工具执行函数绑定到 McpRegistry（让 executor 能调用真实工具） =====
    this.bindTools();

    // ===== Step 2: 构建 LangGraph =====
    const agentMode = this.config.get<string>('agent.engine') || 'multi';
    if (agentMode !== 'multi') {
      this.logger.warn(`MultiAgent disabled by config (agent.engine=${agentMode})`);
      return;
    }

    try {
      // P0-1 修复：不再直接 new ChatOpenAI，而是用 LlmGatewayChatModel 包装
      // 这样 LangGraph 节点的 model.invoke() 实际走 LlmGateway → 享受 P0 缓存工程
      const providerName = (this.config.get<string>('qwen.model') || 'qwen-plus') as 'qwen' | 'deepseek';
      const model = new LlmGatewayChatModel({
        llmGateway: this.llm,
        provider: providerName,
        interviewId: 'multi-agent-engine',
        userId: 'system',
      });

      const connString =
        this.config.get<string>('database.url') ||
        'postgresql://dev:dev123@postgres:5432/interview';

      try {
        this.checkpointer = PostgresSaver.fromConnString(connString, { schema: 'public' });
        await (this.checkpointer as any).setup();
        this.checkpointerSetupDone = true;
        this.logger.log(`✅ PostgresSaver ready (${connString.replace(/:[^:@]+@/, ':***@')})`);
      } catch (cpErr: any) {
        this.logger.error(`PostgresSaver init failed, falling back to no-checkpoint: ${cpErr.message}`);
        this.checkpointer = null;
      }

      this.graph = buildInterviewGraph(model, this.checkpointer || undefined);
      this.enabled = true;
      this.logger.log(`✅ MultiAgent graph compiled (provider=${providerName}, llmGateway=ON, checkpoint=${this.checkpointer ? 'postgres' : 'none'})`);
    } catch (err: any) {
      this.logger.error(`MultiAgent init failed: ${err.message}`);
    }
  }

  /**
   * 把 NestJS 注入的真实服务通过 bindExecute 挂到 McpRegistry
   * executor 节点通过 McpRegistry.get(name).execute 调用这些工具
   */
  private bindTools() {
    // bocha_search — 联网搜索
    const bound1 = McpRegistry.bindExecute(
      'bocha_search',
      async (args: any) => this.bocha.execute(args),
    );

    // memory_recall — 长期记忆检索
    const bound2 = McpRegistry.bindExecute(
      'memory_recall',
      async (args: any) => {
        const hits = await this.memory.recall(args.userId || 'unknown', args.query || '', args.limit || 5);
        return { hits: hits.map((m) => ({ content: m.content, timestamp: m.timestamp })) };
      },
    );

    // knowledge_bank — 面试题库 RAG
    const bound3 = McpRegistry.bindExecute(
      'knowledge_bank',
      async (args: any) => {
        const hits = await this.kb.recall(args.query || '', { limit: args.limit || 5 });
        return {
          items: hits.map((h: any) => ({
            title: h.item?.title || '',
            body: h.item?.body || '',
            score: h.score || 0,
          })),
        };
      },
    );

    this.logger.debug(
      `[ToolBinding] bound ${[bound1, bound2, bound3].filter(Boolean).length}/3 tools via McpRegistry`,
    );
  }

  async onModuleDestroy() {
    try {
      await (this.checkpointer as any)?.close?.();
    } catch {}
  }

  isEnabled() {
    return this.enabled;
  }

  async run(userMessage: string, threadId: string, history: BaseMessageLike[] = []) {
    if (!this.graph) throw new Error('MultiAgent not initialized');
    const config: RunnableConfig = { configurable: { thread_id: threadId } };

    const isFirstTurn = history.length === 0;
    const input: Partial<InterviewAgentStateType> = isFirstTurn
      ? { messages: [new HumanMessage(userMessage)] }
      : { messages: [new HumanMessage(userMessage)] };

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

  async *stream(userMessage: string, threadId: string): AsyncGenerator<any, void, unknown> {
    if (!this.graph) throw new Error('MultiAgent not initialized');
    const config: RunnableConfig = { configurable: { thread_id: threadId } };

    const stream = await this.graph.stream(
      { messages: [new HumanMessage(userMessage)] } as any,
      { ...config, streamMode: 'messages' as const },
    );

    let fullResponse = '';

    for await (const [msg, metadata] of stream) {
      const m = msg as any;
      if (m && typeof m.content === 'string') {
        fullResponse += m.content;
        yield {
          type: 'token',
          content: m.content,
          node: (metadata as any)?.node || undefined,
        };
      }
    }

    if (fullResponse) {
      yield { type: 'final_response', content: fullResponse };
    }
  }

  async *streamWithSteps(userMessage: string, threadId: string): AsyncGenerator<any, void, unknown> {
    if (!this.graph) throw new Error('MultiAgent not initialized');
    const config: RunnableConfig = { configurable: { thread_id: threadId } };

    const stream = await this.graph.stream(
      { messages: [new HumanMessage(userMessage)] } as any,
      { ...config, streamMode: 'values' as const },
    );

    for await (const chunk of stream) {
      const state = chunk as any as InterviewAgentStateType;

      if (state.past_steps && state.past_steps.length > 0) {
        const lastStep = state.past_steps[state.past_steps.length - 1] as any;
        yield {
          type: 'step',
          step: lastStep.step.description,
          result: typeof lastStep.result === 'string' ? lastStep.result : JSON.stringify(lastStep.result),
          success: lastStep.success,
        };
      }

      if (state.final_response) {
        yield { type: 'final_response', content: state.final_response };
      }
    }
  }

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

  async listCheckpoints(threadId: string) {
    if (!this.checkpointer) return [];
    try {
      const listFn = (this.checkpointer as any).list;
      if (!listFn) return [];
      const items: any[] = [];
      for await (const cp of listFn.call(this.checkpointer, { configurable: { thread_id: threadId } })) {
        items.push(cp);
      }
      return items;
    } catch (err: any) {
      this.logger.warn(`listCheckpoints failed: ${err.message}`);
      return [];
    }
  }

  /**
   * 检查某个 thread 是否处于 HITL 中断状态
   * 返回 pending 状态和相关信息
   */
  async checkHitlStatus(threadId: string): Promise<{
    isHitlPending: boolean;
    score?: number;
    issues?: string[];
    suggestion?: string;
    finalResponse?: string;
  }> {
    if (!this.graph) return { isHitlPending: false };

    try {
      const state = await this.graph.getState({
        configurable: { thread_id: threadId },
      });

      const values = (state as any).values as InterviewAgentStateType;
      const nextNodes = (state as any).next as string[];

      // 如果下一个要执行的节点是 hitl_review，说明处于 HITL 中断状态
      const isHitlPending = values?.hitl_pending === true || nextNodes?.includes('hitl_review');

      if (!isHitlPending) {
        return { isHitlPending: false };
      }

      return {
        isHitlPending: true,
        score: (values as any).review_score,
        issues: (values as any).review_issues,
        suggestion: (values as any).review_suggestion,
        finalResponse: values?.final_response,
      };
    } catch (err: any) {
      this.logger.warn(`checkHitlStatus failed: ${err.message}`);
      return { isHitlPending: false };
    }
  }

  /**
   * HR 审批后恢复图执行
   * 通过 Command(resume) 传入审批结果
   */
  async resumeAfterHitl(
    threadId: string,
    verdict: 'approved' | 'rejected',
  ): Promise<{ success: boolean; response?: string }> {
    if (!this.graph) {
      return { success: false };
    }

    try {
      const config: RunnableConfig = {
        configurable: { thread_id: threadId },
      };

      // 使用 Command(resume) 恢复 interrupt，传入 HR 审批结果
      const result = await this.graph.invoke(
        new Command({ resume: verdict }),
        config,
      );

      const response = (result as any).final_response || '';
      this.logger.log(`[HITL] Resumed with verdict=${verdict}, response length=${response.length}`);

      return { success: true, response };
    } catch (err: any) {
      this.logger.error(`resumeAfterHitl failed: ${err.message}`);
      return { success: false };
    }
  }
}
