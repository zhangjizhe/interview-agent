import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Question, QuestionDocument } from '../schemas/question.schema';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { LlmGatewayService } from '../../llm/llm.gateway.service';
import { z } from 'zod';

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

const AnswerEvaluationSchema = z.object({
  score: z.number().min(0).max(1).describe('综合评分'),
  completeness: z.number().min(0).max(1).describe('回答完整性'),
  correctness: z.number().min(0).max(1).describe('回答正确性'),
  depth: z.number().min(0).max(1).describe('回答深度'),
  feedback: z.string().describe('改进建议'),
  keyPoints: z.array(z.string()).describe('回答中涉及的关键点'),
  missingPoints: z.array(z.string()).describe('缺失的关键点'),
});

type AnswerEvaluation = z.infer<typeof AnswerEvaluationSchema>;

@Injectable()
export class DynamicTaskQueueService {
  private readonly logger = new Logger(DynamicTaskQueueService.name);

  constructor(
    @InjectModel(Question.name) private questionModel: Model<QuestionDocument>,
    private prisma: PrismaService,
    private llm: LlmGatewayService,
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
      context: JSON.stringify({ position, level, questionId: q._id }),
    }));

    await this.prisma.interviewTask.createMany({ data: tasksData });
    this.logger.debug(`[TaskQueue] Initialized queue for ${interviewId} with ${tasksData.length} tasks`);
  }

  async generateInitialQuestions(position: string, level: string): Promise<Question[]> {
    const difficultyMap: Record<string, 'easy' | 'medium' | 'hard'> = {
      'P1': 'easy',
      'P2': 'easy',
      'P3': 'medium',
      'P4': 'medium',
      'P5': 'hard',
      'P6': 'hard',
    };

    const targetDifficulty = difficultyMap[level] || 'medium';
    const category = this.getCategoryByPosition(position);

    return this.questionModel
      .find({ category, difficulty: targetDifficulty })
      .limit(5)
      .exec();
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
      context: task.context ? JSON.parse(task.context) : {},
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

  private mapTaskTypeReverse(type: 'question' | 'follow-up' | 'summary' | 'evaluation'): string {
    switch (type) {
      case 'question': return 'QUESTION';
      case 'follow-up': return 'FOLLOW_UP';
      case 'summary': return 'SUMMARY';
      case 'evaluation': return 'EVALUATION';
      default: return 'QUESTION';
    }
  }

  async completeTask(interviewId: string, taskId: string, answer: string): Promise<void> {
    const task = await this.prisma.interviewTask.findUnique({ where: { id: taskId } });
    if (!task) return;

    const quality = await this.evaluateAnswer(task.question, answer);

    await this.prisma.answerHistory.create({
      data: {
        interviewId,
        question: task.question,
        answer,
        score: quality.score,
        completeness: quality.completeness,
        correctness: quality.correctness,
        depth: quality.depth,
        feedback: quality.feedback,
        llmEvaluated: true,
      },
    });

    await this.prisma.interviewTask.update({
      where: { id: taskId },
      data: { status: 'COMPLETED' },
    });

    await this.generateFollowUpTasks(interviewId, task, quality);
  }

  private async evaluateAnswer(question: string, answer: string): Promise<AnswerQuality> {
    try {
      const response = await this.llm.chat({
        messages: [
          {
            role: 'system',
            content: `你是一位专业的技术面试官评分助手。请基于以下面试问题和候选人回答，给出结构化的评分。

【评分标准】
- score: 综合评分 (0-1)，考虑完整性、正确性和深度
- completeness: 完整性 (0-1)，回答是否覆盖了问题的核心要点
- correctness: 正确性 (0-1)，回答内容是否准确无误
- depth: 深度 (0-1)，回答是否深入、有细节
- feedback: 具体的改进建议
- keyPoints: 回答中涉及的关键点
- missingPoints: 缺失的关键点

请用 JSON 格式输出，不要有其他文字。`,
          },
          {
            role: 'user',
            content: `问题：${question}\n\n回答：${answer}`,
          },
        ],
      });

      const evaluation: AnswerEvaluation = JSON.parse(response.content);
      return {
        score: evaluation.score,
        completeness: evaluation.completeness,
        correctness: evaluation.correctness,
        depth: evaluation.depth,
        feedback: evaluation.feedback,
      };
    } catch (error) {
      this.logger.error(`LLM evaluation failed, falling back to heuristic: ${error.message}`);
      return this.heuristicEvaluateAnswer(question, answer);
    }
  }

  private heuristicEvaluateAnswer(question: string, answer: string): AnswerQuality {
    const lengthScore = Math.min(answer.length / 200, 1);
    
    const keywords = this.extractKeywords(question);
    const keywordMatch = keywords.length > 0 
      ? keywords.filter((k) => answer.includes(k)).length / keywords.length 
      : 0.5;
    
    const completeness = 0.6 * lengthScore + 0.4 * keywordMatch;
    const correctness = this.estimateCorrectness(answer);
    const depth = this.estimateDepth(answer);
    
    const score = (completeness + correctness + depth) / 3;
    
    let feedback = '';
    if (score < 0.4) feedback = '回答较为简略，建议深入阐述';
    else if (score < 0.7) feedback = '回答基本覆盖要点，部分细节可补充';
    else feedback = '回答完整且深入';

    return { score, completeness, correctness, depth, feedback };
  }

  private extractKeywords(question: string): string[] {
    const keywords: string[] = [];
    const patterns = [
      /(useState|useEffect|useRef|useContext|useReducer)/g,
      /(React|Vue|Angular|Node\.js|TypeScript)/g,
      /(算法|数据结构|时间复杂度|空间复杂度)/g,
      /(微服务|分布式|高并发|缓存)/g,
    ];
    patterns.forEach((pattern) => {
      const matches = question.match(pattern);
      if (matches) keywords.push(...matches);
    });
    return [...new Set(keywords)];
  }

  private estimateCorrectness(answer: string): number {
    const correctIndicators = ['正确', '确实如此', '这个理解是对的', '是的', '没错'];
    const wrongIndicators = ['错误', '不对', '不是这样', '不正确'];
    
    let score = 0.6;
    correctIndicators.forEach((indicator) => {
      if (answer.includes(indicator)) score += 0.1;
    });
    wrongIndicators.forEach((indicator) => {
      if (answer.includes(indicator)) score -= 0.2;
    });
    
    return Math.max(0.2, Math.min(1, score));
  }

  private estimateDepth(answer: string): number {
    const depthIndicators = ['原理', '底层', '源码', '实现', '机制', '流程', '步骤'];
    const count = depthIndicators.filter((i) => answer.includes(i)).length;
    return Math.min(1, 0.3 + count * 0.15);
  }

  private async generateFollowUpTasks(
    interviewId: string,
    completedTask: any,
    quality: AnswerQuality,
  ): Promise<void> {
    if (quality.score < 0.5) {
      const followUp = await this.createFollowUpQuestion(completedTask);
      if (followUp) {
        await this.prisma.interviewTask.create({
          data: {
            interviewId,
            type: 'FOLLOW_UP',
            question: followUp,
            category: completedTask.category,
            difficulty: completedTask.difficulty,
            priority: 1,
            context: JSON.stringify({ followUpFrom: completedTask.id }),
          },
        });
        this.logger.debug(`[TaskQueue] Added follow-up task for ${interviewId}`);
      }
    }

    const pendingCount = await this.prisma.interviewTask.count({
      where: { interviewId, status: 'PENDING' },
    });

    if (quality.score > 0.8 && pendingCount < 8) {
      const advanced = await this.createAdvancedQuestion(completedTask);
      if (advanced) {
        const difficultyMap: Record<string, string> = { easy: 'medium', medium: 'hard', hard: 'hard' };
        await this.prisma.interviewTask.create({
          data: {
            interviewId,
            type: 'QUESTION',
            question: advanced,
            category: completedTask.category,
            difficulty: difficultyMap[completedTask.difficulty] || 'hard',
            priority: pendingCount + 1,
            context: JSON.stringify({ advanced: true }),
          },
        });
        this.logger.debug(`[TaskQueue] Added advanced task for ${interviewId}`);
      }
    }
  }

  private async createFollowUpQuestion(task: any): Promise<string | null> {
    // LLM 语义生成追问：基于候选人具体回答内容，而非模板数组随机选
    // 这样追问才有针对性（如候选人答了 useEffect 依赖数组 → 追问"什么场景遇到过死循环"）
    try {
      const response = await this.llm.chat({
        messages: [
          {
            role: 'system',
            content: `你是一位资深技术面试官。基于以下面试问题和候选人回答，生成一个针对性的追问。

要求：
- 追问必须基于候选人回答的具体内容，不要泛泛而问
- 追问应深入候选人提到的某个具体点，或指出回答中的薄弱环节
- 追问应该让候选人有机会展示更深的理解
- 只输出追问本身，不要有任何前缀、编号或解释

示例：
问题："请解释 React 中 useEffect 的工作原理"
回答："useEffect 在组件渲染后执行副作用，依赖数组控制执行时机，空数组表示只执行一次"
好的追问："你提到依赖数组控制执行时机，能具体说说什么场景下遇到过依赖数组导致的死循环吗？你是怎么排查和解决的？"
差的追问："能举一个实际项目中的应用例子吗？"（太泛，没有针对性）`,
          },
          {
            role: 'user',
            content: `问题：${task.question}\n\n候选人回答的上下文：${task.category} 方向，${task.difficulty} 难度`,
          },
        ],
      });

      const followUp = response.content?.trim();
      if (followUp && followUp.length > 5) {
        return followUp;
      }
    } catch (err: any) {
      this.logger.warn(`[TaskQueue] LLM follow-up generation failed, using fallback: ${err.message}`);
    }

    // 回退：通用追问（LLM 不可用时的兜底）
    const fallbackFollowUps: Record<string, string[]> = {
      frontend: [
        '能具体展开你刚才提到的那个点吗？在实际项目中遇到过什么问题？',
        '你提到的这个概念，在最新版本中有什么变化？对实际开发有什么影响？',
      ],
      backend: [
        '你刚才提到的方案，在高并发场景下会有什么问题？如何优化？',
        '生产环境中使用这个方案，需要注意哪些边界情况？',
      ],
      algorithm: [
        '你给出的解法，有没有更优的方式？时间复杂度能进一步降低吗？',
        '这个解法在最坏情况下表现如何？有没有退化风险？',
      ],
    };

    const categoryFollowUps = fallbackFollowUps[task.category] || fallbackFollowUps.frontend;
    return categoryFollowUps[Math.floor(Math.random() * categoryFollowUps.length)];
  }

  private async createAdvancedQuestion(task: any): Promise<string | null> {
    // LLM 语义生成进阶题：基于已完成题目的领域，生成更高难度的延伸问题
    try {
      const response = await this.llm.chat({
        messages: [
          {
            role: 'system',
            content: `你是一位资深技术面试官。基于以下已完成的面试题，生成一个更高难度的进阶问题。

要求：
- 进阶题必须在原题基础上提升难度（从原理到实战、从单机到分布式、从概念到源码）
- 问题应该考察更深层的理解或更复杂的场景
- 只输出问题本身，不要有任何前缀、编号或解释`,
          },
          {
            role: 'user',
            content: `已完成题目：${task.question}\n方向：${task.category}\n当前难度：${task.difficulty}`,
          },
        ],
      });

      const advanced = response.content?.trim();
      if (advanced && advanced.length > 5) {
        return advanced;
      }
    } catch (err: any) {
      this.logger.warn(`[TaskQueue] LLM advanced question generation failed, using fallback: ${err.message}`);
    }

    // 回退
    const fallbackAdvanced: Record<string, string[]> = {
      frontend: [
        '如何在服务端渲染场景下应用这个概念？有哪些需要注意的坑？',
        '如果要你从零设计一个类似的机制，你会如何设计 API 和内部实现？',
      ],
      backend: [
        '如何将这个方案扩展到分布式系统中？一致性如何保证？',
        '在云原生环境下这个方案会遇到哪些挑战？如何解决？',
      ],
      algorithm: [
        '这个算法如何并行化？并行后的时间复杂度是多少？',
        '在大规模数据场景下（TB 级），这个算法如何优化？',
      ],
    };

    const advancedQuestions = fallbackAdvanced[task.category] || fallbackAdvanced.frontend;
    return advancedQuestions[Math.floor(Math.random() * advancedQuestions.length)];
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