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
  INTERVIEW_GRAPH_RECURSION_LIMIT,
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
    this.logger.debug(`[stream-v6] ENTER threadId=${threadId} userId=${userId} content="${userMessage.slice(0, 30)}..."`);
    if (!this.graph) throw new Error('MultiAgent not initialized');
    const config: RunnableConfig = { configurable: { thread_id: threadId } };

    // 流式输出策略（v6 - graph.stream(streamMode: 'messages') + 白名单节点 + final_response 兜底）：
    //
    // 历史问题：
    // v1: graph.invoke() 跑完整图 → 手动切块 yield → 首字延迟 8-15s
    // v2: streamEvents(version:'v2') → on_chat_model_stream → 0 token（未加 handleLLMNewToken）
    // v3: graph.stream(streamMode: ['messages','updates']) → 0 token（误判输出格式）
    // v4: streamEvents + handleLLMNewToken → reviewer 节点流式 OK，但 respond_directly 不流式
    // v5: 白名单 + final_response 兜底（streamEvents 路径）
    //     **v5 失败**：实际跑 API SSE 拿不到任何 token，日志显示只有 on_chain_* 事件，
    //     完全没有 on_chat_model_stream。LangGraph 1.4.x 的 streamEvents 路径对自定义
    //     LlmGatewayChatModel（继承 BaseChatModel）兼容性差，回调链路断了。
    //
    // v6: 改用 graph.stream(streamMode: 'messages') —— LangGraph 原生流式 API，
    //     内部用 StreamMessagesHandler 监听 handleLLMNewToken，**跟 LlmGatewayChatModel
    //     兼容性更好**（实测 emit token）。
    //
    // 链路（v6）：
    //   节点内 collectStreamText → model.stream → LlmGatewayChatModel._streamResponseChunks
    //   → LlmGateway.streamChat 真流式吐 token
    //   → runManager.handleLLMNewToken 触发 LangChain 回调
    //   → LangGraph StreamMessagesHandler (Pregel 内部) 收 handleLLMNewToken
    //   → graph.stream(streamMode: 'messages') emit [AIMessageChunk, metadata]
    //   → 本方法按 STREAM_WHITELIST 过滤 node + 取 message.content
    //   → yield token → SSE 推前端
    //
    // 输出格式（单 streamMode = 'messages'）：
    //   [AIMessageChunk, metadata]
    //   metadata.langgraph_node 是节点名
    //
    // 兜底：graph 完成后用 getState 读 final_response，对比 emittedText，缺的补一次。
    //
    // AsyncLocalStorage 包装：必须用 producer/queue 模式，让 ALS 上下文覆盖 generator 的整个生命周期
    const queue: any[] = [];
    const done = { v: false };
    const err: any[] = [];
    const self = this;
    let emittedText = ''; // 累加已 emit 的 token 文本（兜底对比用）
    let tokenHitCount = 0; // 调试：emit 的 token 数
    let messageChunkCount = 0; // 调试：收到的 chunk 数
    const STREAM_WHITELIST = ['reviewer', 'respond_directly', 'executor'] as const;
    const producer = (async () => {
      try {
        await threadIdStorage.run({ threadId, userId }, async () => {
          // v6 修复：改用 graph.stream(streamMode: 'messages')
          // 不再用 streamEvents（LangGraph 1.4.x + 自定义 BaseChatModel 不兼容）
          this.logger.debug(`[stream-v6] before graph.stream`);
          let stream: any;
          try {
            stream = await self.graph!.stream(
              { messages: [new HumanMessage(userMessage)] } as any,
              { ...config, streamMode: 'messages' as const, recursionLimit: INTERVIEW_GRAPH_RECURSION_LIMIT },
            );
            this.logger.debug(`[stream-v6] graph.stream returned: ${typeof stream}, has Symbol.asyncIterator=${typeof stream?.[Symbol.asyncIterator]}`);
          } catch (e: any) {
            this.logger.error(`[stream-v6] graph.stream THREW: ${e.message}`, e.stack);
            throw e;
          }

          this.logger.debug(`[stream-v6] entering for-await loop`);
          for await (const chunk of stream) {
            messageChunkCount++;
            // 单 streamMode 'messages' 输出：[AIMessageChunk, metadata]
            const tuple = chunk as any;
            const message = Array.isArray(tuple) ? tuple[0] : null;
            const metadata = Array.isArray(tuple) ? tuple[1] : null;
            const node: string = metadata?.langgraph_node ?? '';
            const content = typeof message?.content === 'string' ? message.content : '';
            // 调试日志：每个 chunk + 白名单判断
            this.logger.debug(
              `[stream-v6] chunk #${messageChunkCount}: node=${node || '(empty)'}, content="${content.slice(0, 30)}${content.length > 30 ? '...' : ''}"`,
            );
            // 白名单过滤 + emit + dedup
            //
            // 为什么需要 dedup：
            // LangGraph streamMode: 'messages' 在以下三个时机都会 emit：
            //   1. executor 节点的 ask_llm invoke 结束时（handleLLMEnd emit 完整 AIMessage）
            //   2. reviewer 节点 model.stream 每个 token（handleLLMNewToken）
            //   3. reviewer 节点结束时（handleLLMEnd emit 完整 AIMessage）
            // 如果不 dedup，前端会看到同一段回复 emit 多次，体验极差。
            //
            // dedup 策略：
            //   - 如果 chunk content 等于 emittedText 末尾（handleLLMEnd 重复发完整消息），跳过
            //   - 如果 chunk content 是 emittedText 的真前缀（重复发同一段），跳过
            //   - 否则正常 emit（流式 token 增量）
            if (STREAM_WHITELIST.includes(node as any) && content) {
              if (emittedText.endsWith(content)) {
                // 重复：handleLLMEnd 重复 emit 完整内容，跳过
                this.logger.debug(`[stream-v6] skip duplicate: chunk #${messageChunkCount} (${content.length} chars already emitted)`);
                continue;
              }
              if (emittedText.includes(content) && content.length < emittedText.length / 2) {
                // 重复：内容是已 emit 的子串（且较短），跳过
                this.logger.debug(`[stream-v6] skip substring duplicate: chunk #${messageChunkCount}`);
                continue;
              }
              tokenHitCount++;
              emittedText += content;
              queue.push({ kind: 'data', content, node });
            }
          }
          this.logger.debug(
            `[stream-v6] stream done: chunks=${messageChunkCount}, token-hits=${tokenHitCount}, emitted-chars=${emittedText.length}`,
          );

          // 读 graph 最终 state（reflection / issue_tags / final_response）
          let finalState: any = null;
          try {
            finalState = await self.graph!.getState(config);
          } catch (stateErr: any) {
            self.logger.debug(`[stream] getState skipped: ${stateErr.message}`);
          }

          const finalValues = (finalState?.values as any) || {};

          // ADR #10 Phase 1：写入 reflection_log
          if (self.reflectionService && finalValues) {
            const reviewScore = typeof finalValues.review_score === 'number' ? finalValues.review_score : 0;
            const issueTags = Array.isArray(finalValues.issue_tags) ? finalValues.issue_tags : [];
            const finalResponse = finalValues.final_response || '';
            const reviewIssues = Array.isArray(finalValues.review_issues) ? finalValues.review_issues : [];
            const reflection = finalValues.reflection || '';
            const retryCount = typeof finalValues.retry_count === 'number' ? finalValues.retry_count : 0;
            const hitlPending = !!finalValues.hitl_pending;

            // 仅当 reviewer 有实质评估时记录（避免空记录）
            if (reviewScore > 0 || issueTags.length > 0) {
              // fire-and-forget，失败仅 warn 不抛
              self.reflectionService.record({
                interviewId: threadId,
                userId: userId || 'unknown',
                question: userMessage,
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

          // 兜底：用 getState 读 graph 最终 state，对比 emittedText，缺的补 token
          // 适用场景：
          // - 节点用 model.invoke 但未来漏改（防御扩展）
          // - LangGraph 版本升级后 streamMode 格式变化
          // - callback 链路异常丢 token
          // 实现：拿最终 state.final_response，对比已 emit 文本，缺的尾部补一次。
          if (finalValues) {
            const finalResponse = finalValues.final_response || '';
            if (finalResponse && finalResponse.length > emittedText.length) {
              // 找已 emit 的最大前缀匹配，剩余部分作为兜底 token
              let prefixLen = 0;
              const maxCheck = Math.min(emittedText.length, finalResponse.length);
              for (let i = maxCheck; i > 0; i--) {
                if (emittedText.endsWith(finalResponse.slice(0, i))) {
                  prefixLen = i;
                  break;
                }
              }
              const missingTail = finalResponse.slice(prefixLen);
              if (missingTail) {
                self.logger.warn(
                  `[stream] fallback: emitted ${emittedText.length} chars but state has ${finalResponse.length} chars, ` +
                  `补 ${missingTail.length} chars (callback 链路可能异常)`,
                );
                queue.push({ kind: 'data', content: missingTail, node: 'final_response_fallback' });
              }
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
            node: item.node,
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
            { ...config, streamMode: 'values' as const, recursionLimit: INTERVIEW_GRAPH_RECURSION_LIMIT },
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
