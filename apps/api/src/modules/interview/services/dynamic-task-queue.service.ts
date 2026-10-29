import { Injectable, Logger, Optional } from '@nestjs/common';
import { createHash } from 'crypto';
import { DecisionDomain, Prisma } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { LlmGatewayService } from '../../llm/llm.gateway.service';
import { QuestionBankService } from './question-bank.service';
import { buildInterviewDecisionMessages, parseInterviewDecision } from './interview-decision.contract';
import type { AgentDecision } from './heuristic-decide.util';
import { mapQuestionToJobSkill, QUESTION_SKILL_MAPPING_VERSION } from './question-skill-mapping';
import {
  extractKeywords,
  estimateCorrectness,
  estimateDepth,
  heuristicDecide,
} from './heuristic-decide.util';
import {
  capabilitiesForQuestion,
  categoryForPosition,
} from '../../inference/interview-ontology';
import {
  inferInterviewRouting,
  InterviewRoutingTask,
} from '../../inference/interview-routing-inference';
import { DecisionLedgerService } from '../../inference/decision-ledger.service';

export interface InterviewTask {
  id: string;
  type: 'question' | 'follow-up' | 'summary' | 'evaluation';
  question: string;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  priority: number;
  context: Record<string, any>;
  createdAt: number;
}

export interface AnswerQuality {
  score: number;
  completeness: number;
  correctness: number;
  depth: number;
  feedback: string;
}

/**
 * Agent 决策结果：LLM 一次调用同时完成评分 + 追问决策
 *
 * 旧 Workflow: LLM 评分 → 规则看 score → 决定追问 → LLM 生成追问
 * 新 Agent:    LLM 看完回答 → 自己判断该不该追问 / 追什么 / 是否进阶
 */
/** 本地回退题库（Milvus / LLM 不可用时使用） */
const LOCAL_QUESTIONS: Record<string, { question: string; difficulty: 'easy' | 'medium' | 'hard' }[]> = {
  frontend: [
    { question: '请解释 React 中 useEffect 的工作原理和常见陷阱', difficulty: 'easy' },
    { question: 'useState 和 useReducer 的使用场景有什么区别？', difficulty: 'easy' },
    { question: 'React 18 的并发特性对现有代码有什么影响？', difficulty: 'medium' },
    { question: '如何设计一个高性能的虚拟列表组件？', difficulty: 'medium' },
    { question: '从源码层面解释 React Fiber 架构的调度机制', difficulty: 'hard' },
  ],
  backend: [
    { question: '请解释 Node.js 的事件循环机制', difficulty: 'easy' },
    { question: 'RESTful API 和 GraphQL 各自的优缺点是什么？', difficulty: 'easy' },
    { question: '如何设计一个高可用的分布式缓存方案？', difficulty: 'medium' },
    { question: '数据库连接池的工作原理和调优策略', difficulty: 'medium' },
    { question: 'CAP 定理在实际系统设计中的取舍', difficulty: 'hard' },
  ],
  algorithm: [
    { question: '请解释时间复杂度和空间复杂度的概念', difficulty: 'easy' },
    { question: '常见的排序算法有哪些？各自的复杂度？', difficulty: 'easy' },
    { question: '动态规划的核心思想是什么？如何识别 DP 问题？', difficulty: 'medium' },
    { question: '图的最短路径算法有哪些？适用场景？', difficulty: 'medium' },
    { question: '如何设计一个支持大规模数据的近似最近邻搜索系统？', difficulty: 'hard' },
  ],
  agent: [
    { question: '请设计一个支持工具调用和状态恢复的 Agent 运行时，重点说明状态、重试和幂等性。', difficulty: 'easy' },
    { question: 'RAG 系统中如何平衡召回、重排、上下文窗口和答案可追溯性？', difficulty: 'medium' },
    { question: '如何为生产环境的 Agent 建立离线评测、发布门禁与线上回归机制？', difficulty: 'hard' },
  ],
};

@Injectable()
export class DynamicTaskQueueService {
  private readonly logger = new Logger(DynamicTaskQueueService.name);

  constructor(
    private prisma: PrismaService,
    private llm: LlmGatewayService,
    @Optional() private questionBank?: QuestionBankService,
    @Optional() private decisionLedger?: DecisionLedgerService,
  ) {}

  async initializeQueue(
    interviewId: string,
    position: string,
    level: string,
    selection: {
      mode: string;
      targetJobId?: string;
      targetJobProfileVersion?: number;
      practiceSkillId?: string;
      practiceSkillName?: string;
    } = { mode: 'FULL_SIMULATION' },
  ): Promise<void> {
    const existingTasks = await this.prisma.interviewTask.count({ where: { interviewId } });
    if (existingTasks > 0) {
      this.logger.debug(`[TaskQueue] Queue already initialized for ${interviewId}`);
      return;
    }

    const tasksData = await this.prepareInitialTasks(interviewId, position, level, selection);
    await this.prisma.interviewTask.createMany({ data: tasksData });
    this.logger.debug(`[TaskQueue] Initialized queue for ${interviewId} with ${tasksData.length} tasks`);
  }

  /** Provider-free initial bank read, deliberately outside presentation's DB lock. */
  async prepareInitialTasks(
    interviewId: string,
    position: string,
    level: string,
    selection: { mode: string; targetJobId?: string; targetJobProfileVersion?: number; practiceSkillId?: string; practiceSkillName?: string },
  ): Promise<Prisma.InterviewTaskCreateManyInput[]> {
    const initialQuestions = await this.generateInitialQuestions(position, level);
    return initialQuestions.map((q, index) => ({
      interviewId,
      type: 'QUESTION' as const,
      question: q.question,
      category: q.category,
      difficulty: q.difficulty,
      priority: index + 1,
      context: JSON.stringify({
        position,
        level,
        ...selection,
        questionId: q.questionId,
        questionSelectionSource: q.selectionSource,
        capabilities: capabilitiesForQuestion(q.category, q.question),
      }),
    }));
  }

  async generateInitialQuestions(position: string, level: string): Promise<{
    questionId: string; question: string; category: string; difficulty: string; selectionSource: string;
  }[]> {
    const difficultyMap: Record<string, string> = {
      'P1': 'easy', 'P2': 'easy', 'P3': 'medium', 'P4': 'medium', 'P5': 'hard', 'P6': 'hard',
    };
    const targetDifficulty = difficultyMap[level] || 'medium';
    const category = this.getCategoryByPosition(position);

    // Initial presentation is a bounded stored-row read, not an embedding call.
    let fallbackReason = this.questionBank ? 'no-compatible-stored-question' : 'bank-unavailable';
    if (this.questionBank) {
      try {
        let timer: ReturnType<typeof setTimeout>;
        const results = await Promise.race([
          this.questionBank.selectInitial(position, level, category),
          new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Initial question read timed out')), 5000); }),
        ]).finally(() => clearTimeout(timer));
        if (results.length > 0) {
          return results.map((r) => ({
            questionId: r.questionId,
            question: r.question,
            category: r.category || category,
            difficulty: targetDifficulty,
            selectionSource: 'stored-category-level/v1',
          }));
        }
      } catch (err: any) {
        fallbackReason = 'stored-read-unconfirmed';
        this.logger.warn(`[TaskQueue] Initial stored-row read unconfirmed; using local fallback: ${err.message}`);
      }
    }

    // 回退：本地题库
    const localQs = LOCAL_QUESTIONS[category] || LOCAL_QUESTIONS.frontend;
    return localQs
      .filter((q) => q.difficulty === targetDifficulty)
      .slice(0, 5)
      .map((q, i) => ({
        questionId: `local-${category}-${i}`,
        question: q.question,
        category,
        difficulty: q.difficulty,
        selectionSource: `local-fallback/${fallbackReason}/v1`,
      }));
  }

  private getCategoryByPosition(position: string): string {
    return categoryForPosition(position);
  }

  async getNextTask(interviewId: string): Promise<InterviewTask | undefined> {
    const task = await this.prisma.interviewTask.findFirst({
      where: { interviewId, status: 'PENDING' },
      orderBy: { priority: 'asc' },
    });

    return this.taskView(task);
  }

  async getTask(interviewId: string, taskId: string): Promise<InterviewTask | undefined> {
    const task = await this.prisma.interviewTask.findFirst({ where: { id: taskId, interviewId, status: 'PENDING' } });
    return this.taskView(task);
  }

  async getClaimedTask(
    interviewId: string, userId: string, taskId: string, answer: string, messageId: string,
    claim: { presentationId: string; claimToken: string },
  ): Promise<InterviewTask> {
    const receipt = await this.verifyPresentedAnswer(this.prisma, interviewId, userId, taskId, answer, messageId, claim);
    return this.taskView(receipt.task)!;
  }

  private async verifyPresentedAnswer(
    tx: Prisma.TransactionClient, interviewId: string, userId: string, taskId: string,
    answer: string, messageId: string, claim: { presentationId: string; claimToken: string },
  ) {
    if ([interviewId, userId, taskId, messageId, claim?.presentationId, claim?.claimToken].some(value => typeof value !== 'string' || !value.trim())) {
      throw new Error('An exact presented answer claim is required');
    }
    const receipt = await tx.interviewQuestionPresentation.findFirst({
      where: { id: claim.presentationId, interviewId, taskId, claimMessageId: messageId, claimToken: claim.claimToken, state: 'PROCESSING' },
      include: { task: true, interview: true, claimMessage: true },
    });
    if (!receipt || receipt.interview.userId !== userId || receipt.interview.status !== 'IN_PROGRESS'
      || !receipt.interview.resumeConfirmed || receipt.task.status !== 'PENDING'
      || receipt.question !== receipt.task.question || receipt.claimMessage?.role !== 'user'
      || receipt.claimMessage.content !== answer) throw new Error('The presented answer claim is no longer current');
    return receipt;
  }

  private taskView(task: any): InterviewTask | undefined {
    if (!task) return undefined;

    return {
      id: task.id,
      type: this.mapTaskType(task.type),
      question: task.question,
      category: task.category,
      difficulty: task.difficulty as 'easy' | 'medium' | 'hard',
      priority: task.priority,
      context: task.context ? (typeof task.context === 'string' ? JSON.parse(task.context) : task.context) : {},
      createdAt: task.createdAt.getTime(),
    };
  }

  private mapTaskType(type: string): 'question' | 'follow-up' | 'summary' | 'evaluation' {
    switch (type) {
      case 'QUESTION': return 'question';
      case 'FOLLOW_UP': return 'follow-up';
      case 'SUMMARY': return 'summary';
      case 'EVALUATION': return 'evaluation';
      default: return 'question';
    }
  }

  /**
   * 完成 + Agent 决策：一次 LLM 调用完成评分 + 追问/进阶决策
   *
   * 旧 Workflow:
   *   LLM 评分 → score < 0.5 → 规则触发追问 → LLM 生成追问内容
   *   LLM 评分 → score > 0.8 → 规则触发进阶 → LLM 生成进阶题
   *
   * 新 Agent 决策:
   *   LLM 看完候选人回答 → 自己判断该不该追问 / 追什么 / 是否进阶
   *   不再用硬编码阈值，而是让 LLM 基于语义理解做决策
   */
  async completeTask(
    interviewId: string,
    userId: string,
    taskId: string,
    answer: string,
    answerMessageId?: string,
    claim?: { presentationId: string; claimToken: string },
  ): Promise<void> {
    const task = await this.prisma.interviewTask.findUnique({ where: { id: taskId } });
    if (!task) return;
    if (task.interviewId !== interviewId) throw new Error('Task does not belong to the interview');
    if (claim) await this.verifyPresentedAnswer(this.prisma, interviewId, userId, taskId, answer, answerMessageId!, claim);

    const questionRecord = await this.ensureQuestionRecord(task);
    if (answerMessageId) {
      const existingAnswer = await this.prisma.interviewAnswer.findUnique({
        where: { messageId: answerMessageId },
      });
      if (existingAnswer) {
        this.logger.debug(`[TaskQueue] Answer already recorded for message ${answerMessageId}`);
        return;
      }
    }

    // Agent 一次决策：评分 + 是否追问 + 追问内容 + 是否进阶 + 进阶内容
    const decision = await this.agentDecide(interviewId, userId, task.question, answer, task.category, task.difficulty);

    // 写入评分记录
    const answerHistory = await this.prisma.$transaction(async (tx) => {
      if (claim) {
        const lock = await tx.interview.updateMany({
          where: { id: interviewId, userId, status: 'IN_PROGRESS', resumeConfirmed: true },
          data: { resumeConfirmed: true },
        });
        if (lock.count !== 1) throw new Error('Interview is no longer active');
        await this.verifyPresentedAnswer(tx, interviewId, userId, taskId, answer, answerMessageId!, claim);
        const normalized = await tx.interviewQuestion.findFirst({ where: { id: questionRecord.id, interviewId, sourceTaskId: taskId, question: task.question } });
        if (!normalized) throw new Error('Normalized question no longer matches its presentation');
      }
      const answerRecord = answerMessageId
        ? await tx.interviewAnswer.create({
            data: {
              interviewId,
              questionId: questionRecord.id,
              messageId: answerMessageId,
              content: answer,
            },
          })
        : null;

      const history = await tx.answerHistory.create({
        data: {
          interviewId,
          question: task.question,
          answer,
          score: decision.score,
          completeness: decision.completeness,
          correctness: decision.correctness,
          depth: decision.depth,
          feedback: decision.feedback,
          llmEvaluated: decision.evaluationSource === 'MODEL',
          questionId: questionRecord.id,
          answerId: answerRecord?.id,
        },
      });

      await tx.interviewTask.update({
        where: { id: taskId },
        data: { status: 'COMPLETED' },
      });
      return history;
    });

    const queuedTasks = await this.prisma.interviewTask.findMany({
      where: { interviewId },
    });
    const routingTasks = this.toRoutingTasks(queuedTasks, task);
    const routing = inferInterviewRouting({
      completedTask: routingTasks.find((item) => item.id === task.id)!,
      tasks: routingTasks,
      llmDecision: decision,
    });

    await this.recordRoutingDecision(
      interviewId,
      userId,
      task,
      answerHistory.id,
      answer,
      decision,
      routing,
    );

    // LLM 负责理解回答和生成候选问题；规则层负责约束是否入队及其优先级。
    await this.executeAgentDecision(interviewId, task, routing);
  }

  private async ensureQuestionRecord(task: any) {
    const existing = await this.prisma.interviewQuestion.findUnique({
      where: { sourceTaskId: task.id },
    });
    if (existing) return existing;

    const context = this.parseTaskContext(task.context);
    const parentQuestion = context.followUpFrom
      ? await this.prisma.interviewQuestion.findUnique({
          where: { sourceTaskId: context.followUpFrom },
        })
      : null;
    const mapping = await this.resolveQuestionSkill(task, context);
    return this.prisma.interviewQuestion.create({
      data: {
        interviewId: task.interviewId,
        sourceTaskId: task.id,
        parentQuestionId: parentQuestion?.interviewId === task.interviewId ? parentQuestion.id : undefined,
        externalQuestionId: context.questionId || null,
        skillId: mapping.skillId,
        subSkill: context.subSkill || null,
        question: task.question,
        category: task.category,
        difficulty: task.difficulty,
        expectedEvidence: context.expectedPoints || undefined,
        followUpPurpose: context.followUpReason || null,
        selectionMetadata: {
          mode: context.mode || 'FULL_SIMULATION',
          targetJobId: context.targetJobId || null,
          targetJobProfileVersion: context.targetJobProfileVersion || null,
          practiceSkillId: context.practiceSkillId || null,
          practiceSkillName: context.practiceSkillName || null,
          taskType: task.type,
          questionSelectionSource: context.questionSelectionSource || null,
          ...mapping.selection,
          ...(mapping.metadata ? { skillMapping: mapping.metadata } : {}),
        },
        source: context.advanced ? 'agent-advanced' : task.type === 'FOLLOW_UP' ? 'agent-follow-up' : 'task-queue',
      },
    });
  }

  private async resolveQuestionSkill(task: any, context: Record<string, any>) {
    const unavailable = {
      skillId: null as string | null,
      metadata: { version: QUESTION_SKILL_MAPPING_VERSION, reason: 'job-unavailable', candidateSkillIds: [] as string[], matchedTerms: [] as string[] },
      selection: {} as Record<string, any>,
    };
    // Legacy unlinked sessions remain unassessed; do not invent a target skill.
    if (!context.targetJobId) return { skillId: null, metadata: undefined, selection: {} };
    const interview = await this.prisma.interview.findUnique({
      where: { id: task.interviewId },
      select: { id: true, userId: true, organizationId: true, mode: true, practiceSkillId: true, targetJobId: true, targetJobProfileVersion: true },
    });
    if (!interview) return unavailable;
    unavailable.selection = {
      mode: interview.mode,
      targetJobId: interview.targetJobId,
      targetJobProfileVersion: interview.targetJobProfileVersion,
      practiceSkillId: interview.practiceSkillId,
      practiceSkillName: null,
    };
    if (!interview.targetJobId || !interview.targetJobProfileVersion
      || context.targetJobId !== interview.targetJobId
      || context.targetJobProfileVersion !== interview.targetJobProfileVersion) return unavailable;
    const job = await this.prisma.targetJob.findFirst({
      where: { id: interview.targetJobId, userId: interview.userId, organizationId: interview.organizationId, profileVersion: interview.targetJobProfileVersion, isActive: true },
      include: { skillRequirements: { include: { skill: true } } },
    });
    if (!job || job.id !== interview.targetJobId || job.userId !== interview.userId
      || job.organizationId !== interview.organizationId || !job.isActive
      || job.profileVersion !== interview.targetJobProfileVersion) return unavailable;
    const requirements = job.skillRequirements.filter(requirement =>
      requirement.organizationId === job.organizationId && requirement.targetJobId === job.id && requirement.skill.isActive);
    if (interview.mode === 'SKILL_PRACTICE') {
      const controlled = requirements.find(requirement => requirement.skillId === interview.practiceSkillId);
      return { ...unavailable, skillId: controlled?.skillId || null, selection: { ...unavailable.selection, practiceSkillName: controlled?.skill.name || null }, metadata: { ...unavailable.metadata, reason: controlled ? 'controlled-practice' : 'no-match', candidateSkillIds: controlled ? [controlled.skillId] : [] } };
    }
    if (interview.mode !== 'FULL_SIMULATION') return unavailable;
    const mapped = mapQuestionToJobSkill(task.question, requirements);
    return { ...mapped, selection: unavailable.selection };
  }

  private parseTaskContext(context: unknown): Record<string, any> {
    if (!context) return {};
    if (typeof context === 'string') {
      try {
        return JSON.parse(context);
      } catch {
        return {};
      }
    }
    return context as Record<string, any>;
  }

  /**
   * Agent 决策：LLM 一次调用完成评分 + 追问/进阶决策
   *
   * 关键区别：shouldFollowUp / shouldAdvance 由 LLM 自主判断，
   * 不是 score < 0.5 这种硬编码阈值。
   * LLM 可以在 score=0.6 时也决定追问（比如回答有误导性内容需要澄清），
   * 也可以在 score=0.3 时决定不追问（比如回答太离谱不值得追问）。
   */
  private async agentDecide(
    interviewId: string,  // 2026-06-24 修复：必须传 interviewId 给 llm.chat，
                          // 否则 cost tracker 用 'unknown' 触发 session_costs FK 违反
    userId: string,
    question: string,
    answer: string,
    category: string,
    difficulty: string,
  ): Promise<AgentDecision & { evaluationSource: 'MODEL' | 'HEURISTIC' }> {
    try {
      const response = await this.llm.chat({
        // 2026-06-24 修复：传 interviewId + userId 给 llm.chat，让 cost 统计落对 session_costs row
        // （之前漏传 → LlmGatewayService 用 'unknown' 兜底 → 累计 5 次触发 flushToDb → FK 违反）
        interviewId,
        userId,
        messages: buildInterviewDecisionMessages(question, answer, category, difficulty),
      });

      return { ...parseInterviewDecision(response.content), evaluationSource: 'MODEL' };
    } catch {
      // Provider/parser errors can contain candidate content; retain source, not raw payloads, in logs.
      this.logger.warn('[TaskQueue] Agent decision unavailable; using explicitly non-model heuristic evidence');
      return { ...this.heuristicDecide(question, answer, category), evaluationSource: 'HEURISTIC' };
    }
  }

  /**
   * 启发式回退：LLM 不可用时用规则兜底
   * 这里的阈值是 fallback 逻辑，不是主路径——主路径由 LLM 自主决策
   */
  private heuristicDecide(question: string, answer: string, category: string): AgentDecision {
    return heuristicDecide(question, answer, category);
  }

  /**
   * 启发式回退：LLM 不可用时用规则兜底
   * @internal 实际实现在 heuristic-decide.util.ts（独立文件避免拉入 Prisma/Milvus）
   */
  static heuristicDecideStatic(question: string, answer: string, category: string): AgentDecision {
    return heuristicDecide(question, answer, category);
  }

  /**
   * 执行 Agent 决策结果
   * 注意：追问/进阶的触发完全由 Agent 决策决定，不是规则阈值
   */
  private async executeAgentDecision(
    interviewId: string,
    completedTask: any,
    routing: ReturnType<typeof inferInterviewRouting>,
  ): Promise<void> {
    const { outcome, ...reasoning } = routing;

    if (outcome.createFollowUp && outcome.followUpQuestion) {
      await this.prisma.interviewTask.create({
        data: {
          interviewId,
          type: 'FOLLOW_UP',
          question: outcome.followUpQuestion,
          category: completedTask.category,
          difficulty: completedTask.difficulty,
          priority: 1,
          context: JSON.stringify({
            ...this.parseTaskContext(completedTask.context),
            followUpFrom: completedTask.id,
            followUpReason: outcome.followUpReason,
            capabilities: capabilitiesForQuestion(
              completedTask.category,
              outcome.followUpQuestion,
            ),
            reasoning: { ...reasoning, decision: 'FOLLOW_UP' },
          }),
        },
      });
      this.logger.debug(
        `[TaskQueue] Routing inference created follow-up for ${interviewId}: ${outcome.followUpReason}`,
      );
    }

    if (outcome.createAdvanced && outcome.advancedQuestion) {
      const difficultyMap: Record<string, string> = { easy: 'medium', medium: 'hard', hard: 'hard' };
      await this.prisma.interviewTask.create({
        data: {
          interviewId,
          type: 'QUESTION',
          question: outcome.advancedQuestion,
          category: completedTask.category,
          difficulty: difficultyMap[completedTask.difficulty] || 'hard',
          priority: 9,
          context: JSON.stringify({
            ...this.parseTaskContext(completedTask.context),
            advanced: true,
            capabilities: outcome.advancedCapabilities,
            reasoning: { ...reasoning, decision: 'ADVANCE' },
          }),
        },
      });
      this.logger.debug(`[TaskQueue] Routing inference created advanced task for ${interviewId}`);
    }
  }

  private toRoutingTasks(tasks: any[], completedTask: any): InterviewRoutingTask[] {
    const normalized = tasks.map((task) => ({
      id: task.id,
      type: task.type,
      question: task.question,
      category: task.category,
      difficulty: task.difficulty,
      status: task.id === completedTask.id ? 'COMPLETED' : task.status,
      context: this.parseTaskContext(task.context),
    }));

    if (!normalized.some((task) => task.id === completedTask.id)) {
      normalized.push({
        id: completedTask.id,
        type: completedTask.type,
        question: completedTask.question,
        category: completedTask.category,
        difficulty: completedTask.difficulty,
        status: 'COMPLETED',
        context: this.parseTaskContext(completedTask.context),
      });
    }

    return normalized;
  }

  private async recordRoutingDecision(
    interviewId: string,
    userId: string,
    task: any,
    answerHistoryId: string,
    answer: string,
    decision: AgentDecision,
    routing: ReturnType<typeof inferInterviewRouting>,
  ) {
    if (!this.decisionLedger) return;

    const answerHash = createHash('sha256').update(answer).digest('hex');
    try {
      await this.decisionLedger.record({
        domain: DecisionDomain.INTERVIEW,
        decisionType: 'interview.routing',
        subjectType: 'INTERVIEW_TASK',
        subjectId: task.id,
        interviewId,
        actorId: userId,
        outcome: routing.outcome,
        ruleSetVersion: routing.ruleSetVersion,
        inputSnapshot: {
          taskId: task.id,
          category: task.category,
          difficulty: task.difficulty,
          answerHash,
          score: decision.score,
          missingPoints: decision.missingPoints,
        },
        facts: [
          {
            subjectType: 'INTERVIEW_TASK',
            subjectId: task.id,
            predicate: 'routing.outcome',
            value: routing.outcome,
            sourceType: 'INTERVIEW_TASK',
            sourceId: task.id,
          },
          {
            subjectType: 'INTERVIEW',
            subjectId: interviewId,
            predicate: 'capability.assessed',
            value: {
              taskId: task.id,
              capabilities: routing.evidence.completedCapabilities,
            },
            sourceType: 'ANSWER_HISTORY',
            sourceId: answerHistoryId,
          },
        ],
        evidence: [
          {
            kind: 'RULE_EVALUATION',
            sourceType: 'INTERVIEW_ROUTING',
            sourceId: task.id,
            payload: {
              matchedRules: routing.matchedRules,
              evidence: routing.evidence,
            },
          },
          {
            kind: 'ANSWER_SCORE',
            sourceType: 'ANSWER_HISTORY',
            sourceId: answerHistoryId,
            payload: {
              answerHash,
              score: decision.score,
              completeness: decision.completeness,
              correctness: decision.correctness,
              depth: decision.depth,
            },
          },
        ],
      });
    } catch (error: any) {
      // 候选人主链路优先：审计存储异常不能阻断答题与 SSE。
      this.logger.warn(
        `[TaskQueue] Decision ledger failed for ${interviewId}: ${error?.message || error}`,
      );
    }
  }

  private extractKeywords(question: string): string[] {
    return extractKeywords(question);
  }

  /**
   * @internal 实际实现在 heuristic-decide.util.ts
   */
  static extractKeywords(question: string): string[] {
    return extractKeywords(question);
  }

  private estimateCorrectness(answer: string): number {
    return estimateCorrectness(answer);
  }

  /**
   * @internal 实际实现在 heuristic-decide.util.ts
   */
  static estimateCorrectness(answer: string): number {
    return estimateCorrectness(answer);
  }

  private estimateDepth(answer: string): number {
    return estimateDepth(answer);
  }

  /**
   * @internal 实际实现在 heuristic-decide.util.ts
   */
  static estimateDepth(answer: string): number {
    return estimateDepth(answer);
  }

  async getQueueStatus(interviewId: string): Promise<{
    pendingTasks: number;
    completedCount: number;
    avgQuality: number;
  }> {
    const pendingCount = await this.prisma.interviewTask.count({
      where: { interviewId, status: 'PENDING' },
    });

    const completedCount = await this.prisma.interviewTask.count({
      where: { interviewId, status: 'COMPLETED' },
    });

    const history = await this.prisma.answerHistory.findMany({ where: { interviewId } });

    const avgQuality = history.length > 0
      ? history.reduce((sum, h) => sum + h.score, 0) / history.length
      : 0;

    return {
      pendingTasks: pendingCount,
      completedCount,
      avgQuality,
    };
  }

  async clearQueue(interviewId: string): Promise<void> {
    await this.prisma.interviewTask.deleteMany({ where: { interviewId } });
    await this.prisma.answerHistory.deleteMany({ where: { interviewId } });
    this.logger.debug(`[TaskQueue] Cleared queue for ${interviewId}`);
  }

  async getAnswerHistory(interviewId: string): Promise<{ question: string; answer: string; quality: AnswerQuality }[]> {
    const history = await this.prisma.answerHistory.findMany({ where: { interviewId } });

    return history.map((h) => ({
      question: h.question,
      answer: h.answer,
      quality: {
        score: h.score,
        completeness: h.completeness,
        correctness: h.correctness,
        depth: h.depth,
        feedback: h.feedback || '',
      },
    }));
  }
}
