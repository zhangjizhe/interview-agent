import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmGatewayService } from '../llm/llm.gateway.service';
import { MemoryService, type WorkingState } from '../memory/memory.service';
import { LangfuseService } from '../../infra/langfuse/langfuse.service';
import { BochaSearchTool } from './tools/bocha-search.tool';
import { GitHubTool } from './tools/github.tool';
import { NotionTool } from './tools/notion.tool';
import { ContextManager } from './services/context-manager.service';
import { DeepAgentsAgentService } from './deepagents-agent.service';
import { MultiAgentService } from './multi-agent.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { McpRegistry } from '../interview/services/mcp-registry';
import { DynamicTaskQueueService } from '../interview/services/dynamic-task-queue.service';
import { ChatMessage, StreamChunk } from '../llm/providers/types';
import { extractFirstJsonObject, safeJsonParse } from '../../common/json-extract';
import {
  matchBank,
  pickQuestions,
  buildScoringRubric,
  type BankKey,
  type Question,
} from '../interview/knowledge-banks';

export interface AgentEvent {
  type:
    | 'token'
    | 'tool_call'
    | 'tool_result'
    | 'done'
    | 'error'
    | 'token_usage'
    | 'meta'
    | 'thinking'
    | 'searching'
    | 'recalling';
  content?: string;
  toolName?: string;
  toolResult?: any;
  error?: string;
  question?: Question;
  // meta/thinking/searching/recalling 扩展
  engine?: string;
  intent?: string;
  steps?: string[];
  plan?: string[];
  detail?: string;
  promptTokens?: number;
  completionTokens?: number;
  total?: number;
}

export interface AgentContext {
  userId: string;
  sessionId: string;
  position: string;
  level: string;
  provider?: string; // P0-3 修复：按 provider 取 maxTokens 配置
}

@Injectable()
export class InterviewAgentService {
  private readonly logger = new Logger(InterviewAgentService.name);

  constructor(
    private llm: LlmGatewayService,
    private memory: MemoryService,
    private langfuse: LangfuseService,
    private bocha: BochaSearchTool,
    private contextMgr: ContextManager,
    private deepAgents: DeepAgentsAgentService,
    private multiAgent: MultiAgentService,
    private config: ConfigService,
    private prisma: PrismaService,
    private taskQueue: DynamicTaskQueueService,
  ) {}

  /**
   * 处理候选人消息 - 核心流式入口
   */
  async *processMessage(
    ctx: AgentContext,
    userInput: string,
  ): AsyncGenerator<AgentEvent, void, void> {
    // P0: 启动会话级成本追踪（幂等）
    try {
      await this.llm.startSession(ctx.sessionId, ctx.userId);
    } catch (e) {
      this.logger.debug(`startSession cost failed (non-fatal): ${e.message}`);
    }

    const trace = this.langfuse.startTrace({
      name: 'interview.process_message',
      userId: ctx.userId,
      sessionId: ctx.sessionId,
      metadata: { position: ctx.position, level: ctx.level },
    });
    const traceId = trace?.id;

    try {
      await this.memory.appendMessage(ctx.sessionId, {
        role: 'user',
        content: userInput,
      });

      const context = await this.memory.buildContext(
        ctx.sessionId,
        ctx.userId,
        userInput,
      );
      this.langfuse.logSpan({
        traceId,
        name: 'memory.recall',
        output: {
          longTermCount: context.recalledMemories.length,
          shortTermCount: context.shortTermMessages.length,
        },
      });

      // 读取工作记忆状态（面试流程状态）
      const workingState = await this.memory.getWorkingState(ctx.sessionId);

      // ===== 动态任务队列驱动（统一题号追踪）=====
      // 初始化队列（幂等操作）
      await this.taskQueue.initializeQueue(ctx.sessionId, ctx.position, ctx.level);
      
      // 获取当前任务（支持动态出题、follow-up、自适应）
      const currentTask = await this.taskQueue.getNextTask(ctx.sessionId);
      
      // 知识库驱动备选：根据岗位匹配选题（兼容旧逻辑）
      const bank: BankKey = matchBank(ctx.position);
      const questions = pickQuestions(bank, 5);
      
      // P0-2 修复：题号统一从 taskQueue 统计，不依赖 workingState.questionIndex
      const queueStatus = await this.taskQueue.getQueueStatus(ctx.sessionId);
      const questionIndex = queueStatus.completedCount;
      
      // 优先使用动态任务队列的题目，回退到知识库选题
      const currentQuestion = currentTask 
        ? {
            question: currentTask.question,
            keyPoints: ['待扩展：动态任务队列评分要点'],
            referenceAnswer: '',
          } as Question
        : questions[questionIndex] || this.findCurrentQuestion(context.shortTermMessages, questions);

      // 如果有当前题目，把题目和评分要点塞进 system prompt
      const questionContext = currentQuestion
        ? `\n\n【当前正在提问的题目】\n${currentQuestion.question}\n` +
        `【考察点（评分依据）】\n${currentQuestion.keyPoints.join('\n- ')}\n` +
        `【参考答案】\n${currentQuestion.referenceAnswer}\n` +
        `（请基于以上要点评估候选人的回答，必要时追问或过渡到下一题）`
        : `\n\n【题目已问完，进入收尾阶段】可以总结候选人表现并询问他有什么想问你的。`;

      const systemPrompt =
        `你是一位专业的 AI 面试官小面，正在面试【${ctx.position}】岗位（${ctx.level}）的候选人。\n\n` +
        `【出题范围】${bank === 'agent' ? 'AI Agent / LLM 工程' : '前端开发'}方向，从知识库出题。\n` +
        `【对话原则】每次只问一个题，候选人回答后先简要认可或追问，再进入下一题。\n` +
        `【风格】专业、友好、像真人面试官，不要用 Markdown 标题。\n` +
        `【候选人历史】\n${context.longTermContext || '暂无'}` +
        questionContext;

      // ===== 按用户偏好过滤工具 =====
      const userPrefs = await this.prisma.userToolPreference.findMany({
        where: { userId: ctx.userId },
      });
      const userPrefMap = new Map<string, boolean>(userPrefs.map((p) => [p.toolName, p.enabled]));
      const availableTools = await McpRegistry.getAvailableTools(ctx.userId, userPrefMap);

      // 构建 LLM tools 定义：只包含系统+用户都启用的工具
      const tools: any[] = [];
      const toolNames = new Set(availableTools.map((t) => t.name));
      if (toolNames.has('bocha_search')) {
        tools.push(BochaSearchTool.definition);
      }
      // ADR #11：MCP 第三方工具集成（GitHub 3 个 tools）
      for (const ghDef of GitHubTool.definitions) {
        if (toolNames.has(ghDef.function.name)) {
          tools.push(ghDef);
        }
      }
      // ADR #11：Notion 集成 3 个 tools
      for (const notionDef of NotionTool.definitions) {
        if (toolNames.has(notionDef.function.name)) {
          tools.push(notionDef);
        }
      }

      this.langfuse.logSpan({
        traceId,
        name: 'tools.filtered',
        output: {
          total: McpRegistry.count(),
          available: availableTools.length,
          toolNames: availableTools.map((t) => t.name),
        },
      });

      let fullResponse = '';
      // P1-3 修复：appendMessage (L101) 已把 user 消息写入短期记忆，
      // shortTermMessages 末尾可能就是当前 userInput（取决于 buildContext
      // 实现是否含本轮消息）。拼接时去重，避免 LLM 看到两条相同 user 消息。
      const lastShortMsg = context.shortTermMessages[context.shortTermMessages.length - 1];
      const userAlreadyInShortTerm =
        lastShortMsg?.role === 'user' && lastShortMsg?.content === userInput;
      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...(userAlreadyInShortTerm ? context.shortTermMessages.slice(0, -1) : context.shortTermMessages),
        { role: 'user', content: userInput },
      ];

      // ===== 给前端的"思考中"指示 =====
      yield { type: 'thinking', content: '正在召回长期记忆并构建上下文...' };
      yield {
        type: 'recalling',
        detail: `召回 ${context.recalledMemories.length} 条长期记忆 / ${context.shortTermMessages.length} 条短期消息`,
      };

      // ===== 上下文压缩（MUR AI 4 级水位线）=====
      const beforeTokens = this.estimateMessagesTokens(messages);
      // P0-3 修复：按 ctx.provider 取配置项，三级 fallback
      const provider = ctx.provider || 'qwen';
      const providerMaxTokens = this.config.get<number>(`llm.${provider}.maxTokens`)
        ?? this.config.get<number>('llm.default.maxTokens')
        ?? 32000;
      const compaction = this.contextMgr.compact(messages, beforeTokens, providerMaxTokens);

      // Langfuse 埋点：可观测压缩行为
      this.langfuse.logSpan({
        traceId,
        name: 'context.compact',
        output: {
          tier: compaction.tier,
          beforeTokens,
          afterTokens: compaction.afterTokens,
          savedTokens: compaction.savedTokens,
          stubCount: compaction.stubCount,
          protectedCount: compaction.protectedCount,
        },
      });

      let finalMessages = compaction.messages;
      if (compaction.summarizeNeeded) {
        // Tier 3: 调 LLM 做增量摘要
        yield { type: 'thinking', content: '上下文较长，正在增量摘要历史对话...' };
        const { summary } = await this.contextMgr.summarize(
          compaction.messages,
          '', // 简化：暂不持久化 previousSummary
          async (prompt) => {
            const res = await this.llm.chat({
              messages: [{ role: 'user', content: prompt }],
              temperature: 0.3,
              traceId,
              interviewId: ctx.sessionId,
              userId: ctx.userId,
            });
            return res.content;
          },
        );
        finalMessages = [
          { role: 'system', content: systemPrompt },
          { role: 'system', content: `【之前对话摘要】\n${summary}` },
          { role: 'user', content: userInput },
        ];
        this.langfuse.logSpan({
          traceId,
          name: 'context.summarize',
          output: { summaryLength: summary.length },
        });
      }

      // ===== 写真实 deepagents 调用 =====
      // agent_mode 开关：multi | deepagents | llm-direct（默认 multi）
      const agentMode = this.config.get<string>('agent.engine') || 'multi';
      const useDeepAgents = agentMode === 'deepagents' && this.deepAgents.isReady();
      const useMultiAgent = agentMode === 'multi' && this.multiAgent.isEnabled();

      this.langfuse.logSpan({
        traceId,
        name: 'agent.engine',
        output: {
          engine: useMultiAgent ? 'multi-agent' : useDeepAgents ? 'deepagents' : 'llm-direct',
          agentMode,
        },
      });

      yield {
        type: 'meta',
        engine: useMultiAgent ? 'multi-agent' : useDeepAgents ? 'deepagents' : 'llm-direct',
        intent: '评估候选人回答 / 追问 / 进入下一题',
        plan: [`知识库: ${bank}`, `当前候选: ${currentQuestion?.question?.slice(0, 30) || '（首问）'}...`],
      };

      yield { type: 'thinking', content: '正在调用 LLM 生成面试官回复...' };

      if (useMultiAgent) {
        // 多 Agent（LangGraph Supervisor 拓扑）：planner → executor → replanner → reviewer
        // 注意：history 由 MultiAgentService 通过 PostgresSaver checkpointer 自动维护（thread_id = sessionId）
        for await (const chunk of this.multiAgent.stream(userInput, ctx.sessionId, ctx.userId)) {
          if (chunk.type === 'token' && chunk.content) {
            fullResponse += chunk.content;
            yield { type: 'token', content: chunk.content };
          }
        }
      } else if (useDeepAgents) {
        // deepagents 接管（流式）
        const llmMessages = finalMessages.map((m) => ({
          role: m.role as 'system' | 'user' | 'assistant',
          content: m.content,
        }));

        for await (const chunk of this.deepAgents.stream(systemPrompt, llmMessages)) {
          fullResponse += chunk;
          yield { type: 'token', content: chunk };
        }
      } else {
        // 兜底：手写循环 - P0 接入：传 interviewId / userId / semanticCacheType
        for await (const chunk of this.llm.streamChat({
          messages: finalMessages,
          tools,
          temperature: 0.7,
          traceId,
          interviewId: ctx.sessionId,
          userId: ctx.userId,
          semanticCacheType: 'interview_question', // P0-2: 面试题启用白名单
        })) {
          if (chunk.content) {
            fullResponse += chunk.content;
            yield { type: 'token', content: chunk.content };
          }
        }
      }

      const needsSearch = toolNames.has('bocha_search') && this.detectSearchIntent(userInput, fullResponse);
      if (needsSearch) {
        yield { type: 'searching', detail: '正在调用 bocha_search 获取行业最新信息...' };
        yield { type: 'tool_call', toolName: 'bocha_search' };
        const searchResult = await this.bocha.execute({ query: userInput });
        yield { type: 'tool_result', toolName: 'bocha_search', toolResult: searchResult };

        // R-P1-1 修复：搜索结果累积到短期记忆 + 标记 system context。
        // 原代码搜索结果仅 yield 给前端，LLM 上下文看不到。本次回复已经发出，
        // 但下次同一 session 的 LLM 调用会看到这条 system 消息，能基于
        // 搜索结果回答（不是真的"重新生成"，但确保后续对话引用搜索数据）。
        // 限制：内容截断到 2000 字符防止短期记忆爆炸；标记 [联网搜索] 前缀便于后续识别。
        try {
          await this.memory.appendMessage(ctx.sessionId, {
            role: 'system',
            content: `[联网搜索] 用户问"${userInput.slice(0, 200)}"\n搜索结果摘要：${JSON.stringify(searchResult ?? '').slice(0, 2000)}`,
          });
        } catch (e) {
          this.logger.warn(`search memory append failed (non-fatal): ${e.message}`);
        }
      }

      await this.memory.appendMessage(ctx.sessionId, {
        role: 'assistant',
        content: fullResponse,
      });

      // R-P1-2 修复：completeTask 接入主流程。
      // 原代码 getNextTask 拿当前任务，但任务完成后没调 completeTask 更新状态，
      // 导致 getNextTask 反复返回同一任务（永远卡在 task 1）。
      // 现在在 assistant 回复完成后调 completeTask（agentDecide 评分 + 写
      // answerHistory + 更新 task status 为 COMPLETED），让下一轮 getNextTask
      // 能拿下一个任务。try/catch 兜底：completeTask 失败不影响主流程。
      if (currentTask) {
        try {
          await this.taskQueue.completeTask(
            ctx.sessionId,
            currentTask.id,
            userInput,
          );
        } catch (e: any) {
          this.logger.warn(
            `completeTask failed for ${currentTask.id} (non-fatal): ${e.message}`,
          );
        }
      }

      // 更新工作记忆状态：题目索引 + 已覆盖技能
      // P0-2 修复：题号从 taskQueue.getQueueStatus 取值（已完成的题数）
      // 旧代码 nextQuestionIndex = questionIndex + 1，与动态队列脱钩
      const nextQuestionIndex = queueStatus.completedCount + 1;
      const newCoveredSkills = [...(workingState.coveredSkills || []), bank];
      await this.memory.updateWorkingState(ctx.sessionId, {
        currentQuestion: currentQuestion?.question,
        questionIndex: nextQuestionIndex,
        coveredSkills: [...new Set(newCoveredSkills)], // 去重
      });

      // 提取最后一个 chunk 的 usage（粗暴但能用）
      // 不用 setImmediate 异步了——直接 await，确保记忆写入
      try {
        await this.memory.memorize(ctx.userId, [
          ...context.shortTermMessages.slice(-4),
          { role: 'user', content: userInput },
          { role: 'assistant', content: fullResponse },
        ]);
        this.logger.debug(`Memorized for user ${ctx.userId}`);
      } catch (err) {
        this.logger.error(`memorize failed: ${err.message}`);
      }

      yield { type: 'done' };
    } catch (err) {
      this.logger.error(`Agent process failed: ${err.message}`, err.stack);
      yield { type: 'error', error: err.message };
    } finally {
      setImmediate(() => this.langfuse.flush().catch(() => { }));
    }
  }

  /**
   * 渐进式查找当前题目（支持动态任务队列）
   * MVP 阶段：返回第一道未完成的题
   * 后续可扩展：结合动态任务队列追踪已问过的题目，支持 follow-up 和自适应出题
   */
  private findCurrentQuestion(
    _shortTerm: ChatMessage[],
    questions: Question[],
  ): Question | null {
    // 渐进式实现：优先返回队列中的第一道题
    // 后续可扩展为从动态任务队列读取
    return questions[0] || null;
  }

  /**
   * 生成面试报告 - 基于知识库评分
   */
  async generateReport(
    ctx: AgentContext,
    conversation: ChatMessage[],
  ): Promise<{
    overallScore: number;
    scores: Record<string, number>;
    strengths: string[];
    weaknesses: string[];
    suggestions: string[];
    /** token 用量，controller 写入 session_costs */
    usage?: { promptTokens: number; completionTokens: number };
  }> {
    const bank: BankKey = matchBank(ctx.position);
    const questions = pickQuestions(bank, 5);
    const rubric = buildScoringRubric(bank, questions);

    const prompt =
      `你是一位严格的面试评估 AI。请基于以下评分细则评估候选人表现。\n\n` +
      `【岗位】${ctx.position}（${ctx.level}）\n\n` +
      `【评分细则（每道题的考察点和参考答案）】\n${rubric}\n\n` +
      `【候选人对话】\n${conversation.map((m) => `${m.role}: ${m.content}`).join('\n')}\n\n` +
      `【评估维度】（每项 0-100）\n` +
      `1. technical（技术深度）：候选人回答命中了多少 keyPoints\n` +
      `2. communication（沟通表达）：思路是否清晰\n` +
      `3. logic（逻辑思维）：分析问题是否有条理\n` +
      `4. learning（学习能力）：面对陌生问题的反应\n\n` +
      `【输出格式】严格 JSON,只用 double quotes,无注释,无尾逗号：\n` +
      `\`\`\`json\n` +
      `{\n` +
      `  "overallScore": <总分 0-100>,\n` +
      `  "scores": { "technical": <0-100>, "communication": <0-100>, "logic": <0-100>, "learning": <0-100> },\n` +
      `  "strengths": ["优点1", "优点2", "优点3"],\n` +
      `  "weaknesses": ["不足1", "不足2"],\n` +
      `  "suggestions": ["建议1", "建议2", "建议3"]\n` +
      `}\n` +
      `\`\`\`\n\n` +
      `【重要】只输出一个 JSON object,不要其他解释文字。`;

    const response = await this.llm.chat({
      messages: [
        { role: 'system', content: '你是一个严格的面试评估 AI。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
    });

    // 调试：记录 LLM 原始输出（出问题排查用）
    if (process.env.DEBUG_LLM_RESPONSE === 'true') {
      this.logger.debug(`LLM report response: ${response.content.slice(0, 500)}...`);
    }

    const parsed = safeJsonParse<{
      overallScore: number;
      scores: Record<string, number>;
      strengths: string[];
      weaknesses: string[];
      suggestions: string[];
    }>(response.content);

    if (!parsed.ok) {
      const errMsg = (parsed as { ok: false; error: string }).error;
      this.logger.error(`generateReport JSON parse failed: ${errMsg}`);
      this.logger.error(`LLM raw response (first 1000 chars): ${response.content.slice(0, 1000)}`);
      throw new Error(`Failed to parse scoring result: ${errMsg}`);
    }
    const result = (parsed as { ok: true; value: any }).value;
    return {
      ...result,
      usage: response.usage, // 把 token 透出给 controller
    };
  }

  private detectSearchIntent(userInput: string, aiResponse: string): boolean {
    const searchKeywords = /最新|现在|如今|当前|当前情况|现状|202[4-9]|203[0-9]|趋势|动态|进展|发展|变化|更新|发布|release|recent|latest|newest|current/i;
    return searchKeywords.test(userInput) || searchKeywords.test(aiResponse);
  }

  private estimateMessagesTokens(messages: ChatMessage[]): number {
    let total = 0;
    for (const m of messages) {
      const text = m.content || '';
      const en = (text.match(/[a-zA-Z\s]/g) || []).length;
      total += Math.ceil(en / 4 + (text.length - en) / 1.5);
    }
    return total;
  }
}
