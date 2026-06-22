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
import { LlmGatewayChatModel, threadIdStorage } from '../../agents/multi-agent/llm-gateway-chat-model';
import { dedupFinalResponse } from '../../agents/multi-agent/dedup';
import { LlmGatewayService } from '../llm/llm.gateway.service';
import { BochaSearchTool } from './tools/bocha-search.tool';
import { GitHubTool } from './tools/github.tool';
import { NotionTool } from './tools/notion.tool';
import { MemoryService } from '../memory/memory.service';
import { KnowledgeBaseService } from '../knowledge-base/knowledge-base.service';
import { McpRegistry } from '../interview/services/mcp-registry';
import { ReflectionService } from '../reflection/reflection.service';

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
    private github: GitHubTool,
    private notion: NotionTool,
    private reflectionService?: ReflectionService, // ADR #10 Phase 1：可选注入，避免循环依赖
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
        // cacheType 让 llmGateway.chat 内部查 semantic cache
        // 命中 → 0 LLM 调用 + 0 token + cost 计数 (provider='semantic_cache')
        // miss → 正常调 LLM + 异步写 cache
        cacheType: 'interview_question',
        // P0 修复：不在初始化时硬编码 interviewId
        // LlmGatewayChatModel._generate 会从 LangGraph runtime config.configurable.thread_id 动态拿真实 sessionId
        // 这里写 'unknown' 仅作为 fallback（如果将来出现脱离 thread_id 的调用）
        interviewId: 'unknown',
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

    // github_get_user — GitHub 用户信息（ADR #11：MCP 第三方工具集成）
    const bound4 = McpRegistry.bindExecute(
      'github_get_user',
      async (args: any) => this.github.execute('github_get_user', args),
    );

    // github_list_repos — GitHub 仓库列表
    const bound5 = McpRegistry.bindExecute(
      'github_list_repos',
      async (args: any) => this.github.execute('github_list_repos', args),
    );

    // github_get_readme — GitHub 仓库 README
    const bound6 = McpRegistry.bindExecute(
      'github_get_readme',
      async (args: any) => this.github.execute('github_get_readme', args),
    );

    // ADR #11：Notion 集成 3 个 tools
    const bound7 = McpRegistry.bindExecute(
      'notion_search',
      async (args: any) => this.notion.execute('notion_search', args),
    );
    const bound8 = McpRegistry.bindExecute(
      'notion_get_page',
      async (args: any) => this.notion.execute('notion_get_page', args),
    );
    const bound9 = McpRegistry.bindExecute(
      'notion_list_databases',
      async (args: any) => this.notion.execute('notion_list_databases', args),
    );

    this.logger.debug(
      `[ToolBinding] bound ${[bound1, bound2, bound3, bound4, bound5, bound6, bound7, bound8, bound9].filter(Boolean).length}/9 tools via McpRegistry`,
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

    // 用 AsyncLocalStorage 包装，让 _generate 拿到真实 threadId
    // （LangChain v1.x _generate 拿到的 options.configurable 已被剥离）
    const result = await threadIdStorage.run({ threadId }, async () =>
      this.graph!.invoke(input as any, config),
    );

    return {
      response: (result as any).final_response || '',
      intent: (result as any).user_intent,
      plan: (result as any).plan,
      pastSteps: (result as any).past_steps,
      steps: ((result as any).past_steps || []).length,
      threadId,
    };
  }

  async *stream(userMessage: string, threadId: string, userId?: string): AsyncGenerator<any, void, unknown> {
    if (!this.graph) throw new Error('MultiAgent not initialized');
    const config: RunnableConfig = { configurable: { thread_id: threadId } };

    // 流式输出策略（v3 - graph.stream + streamMode 双模式）：
    //
    // v1: graph.invoke() 跑完整图 → 手动切块 yield → 首字延迟 8-15s
    // v2: streamEvents(version:'v2') → on_chat_model_stream → 0 token（实测失败）
    // v3: graph.stream(streamMode: ['messages', 'updates']) → 正确解析多模式格式
    //
    // v2 失败根因：streamEvents 的 on_chat_model_stream 在 LangGraph 1.3.x +
    //   LlmGatewayChatModel 自定义 BaseChatModel 下不触发（LangChain 回调系统
    //   对自定义 model 的 _streamResponseChunks + handleLLMNewToken 链路不稳定）
    //
    // v3 修复：graph.stream(streamMode: ['messages', 'updates']) 是 LangGraph 原生
    //   流式 API，直接 emit 节点内部 model.stream() 的 AIMessageChunk。
    //   关键：多 streamMode 时输出格式为 [mode, data] 元组，不是裸 [chunk, metadata]。
    //   之前 0 token 就是因为把 ['messages', [chunk, metadata]] 当 [chunk, metadata] 解析，
    //   chunk = 'messages' 字符串，content 永远 undefined。
    //
    // 链路：
    //   reviewer.ts 用 model.stream() → LlmGatewayChatModel._streamResponseChunks()
    //   → LlmGateway.streamChat() 真流式 → AIMessageChunk 增量
    //   → LangGraph streamMode:'messages' emit [AIMessageChunk, metadata]
    //   → 多模式包装为 ['messages', [AIMessageChunk, metadata]]
    //   → 本方法正确解包 → yield token → SSE 推前端
    //
    // AsyncLocalStorage 包装：必须用 producer/queue 模式，让 ALS 上下文覆盖 generator 的整个生命周期
    const queue: any[] = [];
    const done = { v: false };
    const err: any[] = [];
    const self = this;
    const producer = (async () => {
      try {
        await threadIdStorage.run({ threadId, userId }, async () => {
          // 流式输出策略（v4 - streamEvents + on_chat_model_stream）：
          //
          // v1: graph.invoke() 跑完整图 → 手动切块 yield → 首字延迟 8-15s
          // v2: streamEvents(version:'v2') → 0 token（未加 handleLLMNewToken）
          // v3: graph.stream(streamMode: ['messages', 'updates']) → 0 token（reviewer 消费完才 return）
          // v4: streamEvents(version:'v2') + handleLLMNewToken → ✅ 实时 token
          //
          // 关键：reviewer 节点用 model.stream() 消费所有 token 后才 return，
          // 所以 streamMode:'messages' 只能在节点完成后看到完整消息。
          // 必须用 streamEvents 监听 on_chat_model_stream 事件，
          // LlmGatewayChatModel._streamResponseChunks 已加 handleLLMNewToken，
          // 能在 token 生成时实时触发回调。
          const eventStream = await self.graph!.streamEvents(
            { messages: [new HumanMessage(userMessage)] } as any,
            { ...config, version: 'v2' },
          );

          let tokenHitCount = 0;
          let reflectionCaptured: any = null;
          let eventCount = 0;
          let onChatModelStreamCount = 0;
          for await (const event of eventStream) {
            eventCount++;
            const ev = event as any;
            const eventName: string = ev.event ?? '';
            const node: string = ev.metadata?.langgraph_node ?? '';
            
            // 调试：打印所有事件
            self.logger.debug(`[stream] event #${eventCount}: name=${eventName}, node=${node}, data=${ev.data ? 'exists' : 'null'}`);

            // 捕获 reviewer 节点内部 ChatModel 的流式 token
            // on_chat_model_stream 事件的 data.chunk 是 ChatGenerationChunk 类型，
            // 文本内容在 text 属性里，不是 content！
            if (eventName === 'on_chat_model_stream' && node === 'reviewer') {
              onChatModelStreamCount++;
              const chunk = ev.data?.chunk as any;
              // 调试：打印 chunk 结构
              self.logger.debug(`[stream] on_chat_model_stream #${onChatModelStreamCount}: chunk=${JSON.stringify(chunk)}`);
              // ChatGenerationChunk 有 text 属性直接存字符串内容
              const piece = chunk?.text || '';
              self.logger.debug(`[stream] piece="${piece}"`);
              if (piece) {
                tokenHitCount++;
                queue.push({ kind: 'data', content: piece });
              }
            }

            // 捕获 reviewer 节点完成后的 state delta（含 issue_tags / reflection / review_score）
            if (eventName === 'on_chain_end' && node === 'reviewer') {
              const output = ev.data?.output as any;
              if (output) {
                reflectionCaptured = output;
              }
            }
          }
          self.logger.debug(`[stream] total-events=${eventCount}, on_chat_model_stream-events=${onChatModelStreamCount}, reviewer-token-hits=${tokenHitCount} reflection-captured=${!!reflectionCaptured}`);

          // ADR #10 Phase 1：写入 reflection_log
          if (reflectionCaptured && self.reflectionService) {
            const r = reflectionCaptured as any;
            const question = userMessage;
            const finalResponse = r.final_response || '';
            const reviewScore = typeof r.review_score === 'number' ? r.review_score : 0;
            const reviewIssues = Array.isArray(r.review_issues) ? r.review_issues : [];
            const issueTags = Array.isArray(r.issue_tags) ? r.issue_tags : [];
            const reflection = r.reflection || '';
            const retryCount = typeof r.retry_count === 'number' ? r.retry_count : 0;
            const hitlPending = !!r.hitl_pending;

            // 仅当 reviewer 有实质评估时记录（避免空记录）
            if (reviewScore > 0 || issueTags.length > 0) {
              // fire-and-forget，失败仅 warn 不抛
              self.reflectionService.record({
                interviewId: threadId,
                userId: userId || 'unknown',
                question,
                finalResponse,
                reviewScore,
                reviewIssues,
                issueTags,
                reflection: reflection || undefined,
                retryCount,
                hitlPending,
                modelName: 'qwen-plus', // TODO: 从 config 读
                nodeName: 'reviewer',
              }).catch((e: any) => {
                self.logger.warn(`reflection record failed: ${e.message}`);
              });
            }
          }
        });
        done.v = true;
        queue.push({ kind: 'done' });
      } catch (e: any) {
        err.push(e);
        queue.push({ kind: 'done' });
      }
    })();

    try {
      while (true) {
        if (queue.length > 0) {
          const item = queue.shift();
          if (item.kind === 'done') break;
          yield {
            type: 'token',
            content: item.content,
            node: 'reviewer',
          };
          // 30ms 间隔模拟 token 流速（约 100 字/秒，符合人类阅读速度）
          await new Promise((r) => setTimeout(r, 30));
          continue;
        }
        if (err.length > 0) throw err[0];
        if (done.v) break;
        await new Promise((r) => setTimeout(r, 10));
      }
    } finally {
      await producer;
    }
  }

  async *streamWithSteps(userMessage: string, threadId: string, userId?: string): AsyncGenerator<any, void, unknown> {
    if (!this.graph) throw new Error('MultiAgent not initialized');
    const config: RunnableConfig = { configurable: { thread_id: threadId } };

    const queue: any[] = [];
    const done = { v: false };
    const err: any[] = [];
    const self = this;
    const producer = (async () => {
      try {
        await threadIdStorage.run({ threadId, userId }, async () => {
          const stream = await self.graph!.stream(
            { messages: [new HumanMessage(userMessage)] } as any,
            { ...config, streamMode: 'values' as const },
          );
          for await (const chunk of stream) {
            queue.push({ kind: 'data', chunk });
          }
        });
        done.v = true;
        queue.push({ kind: 'done' });
      } catch (e: any) {
        err.push(e);
        queue.push({ kind: 'done' });
      }
    })();

    try {
      while (true) {
        if (queue.length > 0) {
          const item = queue.shift();
          if (item.kind === 'done') break;
          const state = item.chunk as any as InterviewAgentStateType;
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
          continue;
        }
        if (err.length > 0) throw err[0];
        if (done.v) break;
        await new Promise((r) => setTimeout(r, 10));
      }
    } finally {
      await producer;
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

/**
 * 消除 LLM 偶发重复输出
 *
 * 触发场景：reviewer 节点在 retry 时,LlM 概率性输出重复段（如"嗯，这个细节很有意思......嗯，这个细节很有意思......"）
 * 这种重复会让前端 SSE 流式输出两次相同的文案,体验差。
 *
 * 实现：从大到小尝试找"前半段 == 后半段"的重复块,合并掉。
 * 只处理"前 N 字符 == 后 N 字符"的简单重复（最常见的形式）,
 * 复杂交叉重复不做处理(LLM 实际很少发生,过度处理反而会破坏正常内容)。
 */
// dedupFinalResponse 已迁移到 agents/multi-agent/dedup.ts
// 调用方从 '../../agents/multi-agent/dedup' import 共享版本
