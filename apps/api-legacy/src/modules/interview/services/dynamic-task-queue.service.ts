import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { LlmGatewayService } from '../../llm/llm.gateway.service';
import { QuestionBankService } from './question-bank.service';
import { z } from 'zod';
import {
  extractKeywords,
  estimateCorrectness,
  estimateDepth,
  heuristicDecide,
} from './heuristic-decide.util';

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
const AgentDecisionSchema = z.object({
  // ── 评分维度 ──
  score: z.number().min(0).max(1).describe('综合评分'),
  completeness: z.number().min(0).max(1).describe('回答完整性'),
  correctness: z.number().min(0).max(1).describe('回答正确性'),
  depth: z.number().min(0).max(1).describe('回答深度'),
  feedback: z.string().describe('改进建议'),
  keyPoints: z.array(z.string()).describe('回答中涉及的关键点'),
  missingPoints: z.array(z.string()).describe('缺失的关键点'),
  // ── Agent 决策维度 ──
  shouldFollowUp: z.boolean().describe('是否需要追问（Agent 自主判断，不是规则阈值）'),
  followUpQuestion: z.string().nullable().describe('追问问题（基于候选人回答语义生成，null 则不追问）'),
  followUpReason: z.string().nullable().describe('追问理由（为什么追问这个点）'),
  shouldAdvance: z.boolean().describe('是否需要进阶题'),
  advancedQuestion: z.string().nullable().describe('进阶问题（null 则不进阶）'),
});

type AgentDecision = z.infer<typeof AgentDecisionSchema>;

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
};

@Injectable()
export class DynamicTaskQueueService {
  private readonly logger = new Logger(DynamicTaskQueueService.name);

  constructor(
    private prisma: PrismaService,
    private llm: LlmGatewayService,
    @Optional() private questionBank?: QuestionBankService,
  ) {}

  async initializeQueue(interviewId: string, position: string, level: string): Promise<void> {
    const existingTasks = await this.prisma.interviewTask.count({ where: { interviewId } });
    if (existingTasks > 0) {
      this.logger.debug(`[TaskQueue] Queue already initialized for ${interviewId}`);
      return;
    }

    const initialQuestions = await this.generateInitialQuestions(position, level);
    const tasksData = initialQuestions.map((q, index) => ({
      interviewId,
      type: 'QUESTION' as const,
      question: q.question,
      category: q.category,
      difficulty: q.difficulty,
      priority: index + 1,
      context: JSON.stringify({ position, level, questionId: q.questionId }),
    }));

    await this.prisma.interviewTask.createMany({ data: tasksData });
    this.logger.debug(`[TaskQueue] Initialized queue for ${interviewId} with ${tasksData.length} tasks`);
  }

  async generateInitialQuestions(position: string, level: string): Promise<{
    questionId: string; question: string; category: string; difficulty: string;
  }[]> {
    const difficultyMap: Record<string, string> = {
      'P1': 'easy', 'P2': 'easy', 'P3': 'medium', 'P4': 'medium', 'P5': 'hard', 'P6': 'hard',
    };
    const targetDifficulty = difficultyMap[level] || 'medium';
    const category = this.getCategoryByPosition(position);

    // 优先从 Milvus 知识库检索
    if (this.questionBank) {
      try {
        const results = await this.questionBank.search(category, {
          position,
          level,
          category,
          limit: 5,
          rerank: true,
        });
        if (results.length > 0) {
          return results.map((r) => ({
            questionId: r.questionId,
            question: r.question,
            category: r.category || category,
            difficulty: (r as any).difficulty || targetDifficulty,
          }));
        }
      } catch (err: any) {
        this.logger.warn(`[TaskQueue] Milvus search failed, using local fallback: ${err.message}`);
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
      }));
  }

  private getCategoryByPosition(position: string): string {
    if (position.includes('前端')) return 'frontend';
    if (position.includes('后端') || position.includes('服务端')) return 'backend';
    if (position.includes('算法') || position.includes('AI')) return 'algorithm';
    if (position.includes('测试')) return 'testing';
    return 'agent';
  }

  async getNextTask(interviewId: string): Promise<InterviewTask | undefined> {
    const task = await this.prisma.interviewTask.findFirst({
      where: { interviewId, status: 'PENDING' },
      orderBy: { priority: 'asc' },
    });

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
  async completeTask(interviewId: string, userId: string, taskId: string, answer: string): Promise<void> {
    const task = await this.prisma.interviewTask.findUnique({ where: { id: taskId } });
    if (!task) return;

    // Agent 一次决策：评分 + 是否追问 + 追问内容 + 是否进阶 + 进阶内容
    const decision = await this.agentDecide(interviewId, userId, task.question, answer, task.category, task.difficulty);

    // 写入评分记录
    await this.prisma.answerHistory.create({
      data: {
        interviewId,
        question: task.question,
        answer,
        score: decision.score,
        completeness: decision.completeness,
        correctness: decision.correctness,
        depth: decision.depth,
        feedback: decision.feedback,
        llmEvaluated: true,
      },
    });

    await this.prisma.interviewTask.update({
      where: { id: taskId },
      data: { status: 'COMPLETED' },
    });

    // 执行 Agent 决策结果（而非规则触发）
    await this.executeAgentDecision(interviewId, task, decision);
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
  ): Promise<AgentDecision> {
    try {
      const response = await this.llm.chat({
        // 2026-06-24 修复：传 interviewId + userId 给 llm.chat，让 cost 统计落对 session_costs row
        // （之前漏传 → LlmGatewayService 用 'unknown' 兜底 → 累计 5 次触发 flushToDb → FK 违反）
        interviewId,
        userId,
        messages: [
          {
            role: 'system',
            content: `你是一位资深技术面试官，需要同时完成两件事：

1. **评估候选人回答**：给出结构化评分
2. **自主决策下一步**：基于回答的语义内容（而非分数阈值），决定是否追问或出进阶题

【评分标准】
- score: 综合评分 (0-1)
- completeness: 完整性 (0-1)，是否覆盖核心要点
- correctness: 正确性 (0-1)，内容是否准确
- depth: 深度 (0-1)，是否有细节和原理
- feedback: 改进建议
- keyPoints: 回答中涉及的关键点
- missingPoints: 缺失的关键点

【Agent 决策规则】
- shouldFollowUp: 你自己判断是否需要追问。不要用分数阈值，而是看回答内容：
  - 回答提到了某个概念但理解有偏差 → 追问澄清
  - 回答只说了表面，缺少深层理解 → 追问深入
  - 回答已经很好很完整 → 不需要追问
  - 回答完全跑题 → 不追问（追问也没意义）
- followUpQuestion: 如果 shouldFollowUp=true，生成针对性追问（基于候选人说的具体内容）
- followUpReason: 为什么决定追问这个点
- shouldAdvance: 回答质量很高，可以出更难的题
- advancedQuestion: 如果 shouldAdvance=true，生成进阶题

【追问示例】
问题："请解释 React 中 useEffect 的工作原理"
回答："useEffect 在组件渲染后执行副作用，依赖数组控制执行时机，空数组表示只执行一次"
→ shouldFollowUp=true, followUpQuestion="你提到依赖数组控制执行时机，能具体说说什么场景下遇到过依赖数组导致的死循环吗？你是怎么排查和解决的？", followUpReason="候选人理解了基本概念，但依赖数组是 useEffect 最容易出 bug 的地方，追问可以考察实战经验"

回答："useEffect 就是组件加载时执行代码"
→ shouldFollowUp=true, followUpQuestion="useEffect 的依赖数组具体是怎么工作的？如果依赖项是引用类型会怎样？", followUpReason="回答过于简略，缺少对依赖机制的理解"

回答："useEffect 接收一个回调函数和一个依赖数组。组件挂载时执行回调；依赖数组变化时重新执行；返回函数作为清理逻辑。空数组 [] 表示只在挂载时执行一次。React 18 严格模式下会双重调用以检测副作用。常见陷阱包括闭包陈旧引用和无限循环。"
→ shouldFollowUp=false, followUpQuestion=null, followUpReason="回答已经非常完整，覆盖了核心机制、清理逻辑、严格模式行为和常见陷阱"

请用 JSON 格式输出，不要有其他文字。`,
          },
          {
            role: 'user',
            content: `问题：${question}\n\n候选人回答：${answer}\n\n方向：${category}，难度：${difficulty}`,
          },
        ],
      });

      const parsed = JSON.parse(response.content);
      const decision: AgentDecision = AgentDecisionSchema.parse(parsed);
      return decision;
    } catch (error: any) {
      this.logger.warn(`[TaskQueue] Agent decision failed, falling back to heuristic: ${error.message}`);
      return this.heuristicDecide(question, answer, category);
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
    decision: AgentDecision,
  ): Promise<void> {
    // Agent 决定追问
    if (decision.shouldFollowUp && decision.followUpQuestion) {
      await this.prisma.interviewTask.create({
        data: {
          interviewId,
          type: 'FOLLOW_UP',
          question: decision.followUpQuestion,
          category: completedTask.category,
          difficulty: completedTask.difficulty,
          priority: 1,
          context: JSON.stringify({
            followUpFrom: completedTask.id,
            followUpReason: decision.followUpReason,
          }),
        },
      });
      this.logger.debug(
        `[TaskQueue] Agent decided follow-up for ${interviewId}: ${decision.followUpReason}`,
      );
    }

    // Agent 决定进阶
    if (decision.shouldAdvance && decision.advancedQuestion) {
      const pendingCount = await this.prisma.interviewTask.count({
        where: { interviewId, status: 'PENDING' },
      });

      if (pendingCount < 8) {
        const difficultyMap: Record<string, string> = { easy: 'medium', medium: 'hard', hard: 'hard' };
        await this.prisma.interviewTask.create({
          data: {
            interviewId,
            type: 'QUESTION',
            question: decision.advancedQuestion,
            category: completedTask.category,
            difficulty: difficultyMap[completedTask.difficulty] || 'hard',
            priority: pendingCount + 1,
            context: JSON.stringify({ advanced: true }),
          },
        });
        this.logger.debug(`[TaskQueue] Agent decided advance for ${interviewId}`);
      }
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
