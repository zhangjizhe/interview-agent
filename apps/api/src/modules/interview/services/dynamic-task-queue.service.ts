import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { z } from 'zod';
import { Question, QuestionDocument } from '../schemas/question.schema';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { LlmGatewayService } from '../../llm/llm.gateway.service';

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

interface AnswerQuality {
  score: number;
  completeness: number;
  correctness: number;
  depth: number;
  feedback: string;
}

const AnswerQualitySchema = z.object({
  score: z.number().min(0).max(1),
  completeness: z.number().min(0).max(1),
  correctness: z.number().min(0).max(1),
  depth: z.number().min(0).max(1),
  feedback: z.string(),
});

@Injectable()
export class DynamicTaskQueueService {
  private readonly logger = new Logger(DynamicTaskQueueService.name);

  constructor(
    @InjectModel(Question.name) private questionModel: Model<QuestionDocument>,
    private prisma: PrismaService,
    private llm: LlmGatewayService,
  ) {}

  async initializeQueue(interviewId: string, position: string, level: string): Promise<void> {
    const initialQuestions = await this.generateInitialQuestions(position, level);

    for (let index = 0; index < initialQuestions.length; index++) {
      const q = initialQuestions[index];
      const taskId = `${interviewId}-${index}`;
      await this.prisma.taskAnswer.upsert({
        where: { interviewId_taskId: { interviewId, taskId } },
        create: {
          interviewId,
          taskId,
          taskType: 'question',
          question: q.question,
          category: q.category,
          difficulty: q.difficulty,
          priority: index + 1,
        },
        update: {},
      });
    }

    this.logger.debug(`[TaskQueue] Initialized queue for ${interviewId} with ${initialQuestions.length} tasks`);
  }

  async generateInitialQuestions(position: string, level: string): Promise<Question[]> {
    const difficultyMap: Record<string, 'easy' | 'medium' | 'hard'> = {
      P1: 'easy', P2: 'easy', P3: 'medium', P4: 'medium', P5: 'hard', P6: 'hard',
    };
    const targetDifficulty = difficultyMap[level] || 'medium';
    const category = this.getCategoryByPosition(position);

    return this.questionModel
      .find({ category, difficulty: targetDifficulty, active: true })
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
    const pending = await this.prisma.taskAnswer.findMany({
      where: { interviewId, answer: null },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      take: 1,
    });
    if (!pending.length) return undefined;

    const row = pending[0];
    return {
      id: row.taskId,
      type: row.taskType as InterviewTask['type'],
      question: row.question,
      category: row.category,
      difficulty: row.difficulty as InterviewTask['difficulty'],
      priority: row.priority,
      context: { interviewId, taskId: row.taskId, category: row.category },
      createdAt: row.createdAt.getTime(),
    };
  }

  async completeTask(interviewId: string, taskId: string, answer: string): Promise<void> {
    const task = await this.prisma.taskAnswer.findUnique({
      where: { interviewId_taskId: { interviewId, taskId } },
    });
    if (!task) return;

    const quality = await this.evaluateAnswerLLM(task.question, answer);

    await this.prisma.taskAnswer.update({
      where: { interviewId_taskId: { interviewId, taskId } },
      data: { answer, quality: quality as any, answeredAt: new Date() },
    });

    await this.generateFollowUpTasks(interviewId, task, quality);
  }

  /**
   * LLM 结构化输出评分（取代关键词匹配）
   */
  private async evaluateAnswerLLM(question: string, answer: string): Promise<AnswerQuality> {
    try {
      const response = await this.llm.chat(
        {
          messages: [
            {
              role: 'system',
              content: `你是一个专业的 AI 面试评分员。针对候选人的回答给出结构化评分。

评分维度（每项 0-1）：
- completeness: 回答的完整程度（是否覆盖问题要点）
- correctness: 回答的正确性（技术细节是否准确）
- depth: 回答的深度（是否有原理/机制/源码层面的理解）

最终 score = (completeness + correctness + depth) / 3。

返回 JSON（直接可 JSON.parse）：{ "completeness": 0.8, "correctness": 0.9, "depth": 0.6, "score": 0.77, "feedback": "一句话评价" }`,
            },
            { role: 'user', content: `【问题】${question}\n\n【回答】${answer}` },
          ],
        },
        'qwen',
      );

      const parsed = JSON.parse(response.content as string);
      const validated = AnswerQualitySchema.parse(parsed);
      return {
        score: validated.score,
        completeness: validated.completeness,
        correctness: validated.correctness,
        depth: validated.depth,
        feedback: validated.feedback,
      };
    } catch (err) {
      this.logger.warn(`[TaskQueue] LLM scoring failed, fallback to keyword: ${err.message}`);
      return this.evaluateAnswerFallback(question, answer);
    }
  }

  /**
   * 兜底：关键词匹配评分（LLM 失败时降级）
   */
  private evaluateAnswerFallback(question: string, answer: string): AnswerQuality {
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

  private async generateFollowUpTasks(interviewId: string, completedTask: any, quality: AnswerQuality): Promise<void> {
    if (quality.score < 0.5) {
      const followUp = await this.createFollowUpQuestion(completedTask);
      if (followUp) {
        const taskId = `${interviewId}-followup-${Date.now()}`;
        await this.prisma.taskAnswer.create({
          data: {
            interviewId,
            taskId,
            taskType: 'follow-up',
            question: followUp,
            category: completedTask.category,
            difficulty: completedTask.difficulty,
            priority: 1,
          },
        });
        this.logger.debug(`[TaskQueue] Added follow-up task for ${interviewId}`);
      }
    }

    if (quality.score > 0.8) {
      const pendingCount = await this.prisma.taskAnswer.count({
        where: { interviewId, answer: null },
      });
      if (pendingCount < 8) {
        const advanced = await this.createAdvancedQuestion(completedTask);
        if (advanced) {
          const difficultyMap: Record<string, string> = { easy: 'medium', medium: 'hard', hard: 'hard' };
          const taskId = `${interviewId}-advanced-${Date.now()}`;
          await this.prisma.taskAnswer.create({
            data: {
              interviewId,
              taskId,
              taskType: 'question',
              question: advanced,
              category: completedTask.category,
              difficulty: difficultyMap[completedTask.difficulty] || 'hard',
              priority: pendingCount + 1,
            },
          });
          this.logger.debug(`[TaskQueue] Added advanced task for ${interviewId}`);
        }
      }
    }
  }

  private async createFollowUpQuestion(task: any): Promise<string | null> {
    const followUps: Record<string, string[]> = {
      frontend: ['能举一个实际项目中的应用例子吗？', '这个概念在 React 18 中有什么变化？', '和其他类似的 API 相比有什么优势？'],
      backend: ['在高并发场景下会有什么问题？如何优化？', '这个方案的时间复杂度和空间复杂度是多少？', '生产环境中需要注意哪些边界情况？'],
      algorithm: ['有没有更优的解法？时间复杂度是多少？', '这个算法在最坏情况下的表现如何？', '如何证明这个算法的正确性？'],
    };
    const categoryFollowUps = followUps[task.category] || followUps.frontend;
    return categoryFollowUps[Math.floor(Math.random() * categoryFollowUps.length)];
  }

  private async createAdvancedQuestion(task: any): Promise<string | null> {
    const advancedMap: Record<string, string[]> = {
      frontend: ['如何在服务端渲染场景下应用这个概念？', '如果需要实现一个类似的功能，你会如何设计 API？', '这个概念和最新的前端技术趋势有什么联系？'],
      backend: ['如何将这个方案扩展到分布式系统中？', '在云原生环境下会遇到哪些挑战？如何解决？', '这个方案的可观测性如何保证？'],
      algorithm: ['这个算法如何并行化？', '在大规模数据场景下如何优化？', '有没有相关的论文或工业界实践可以参考？'],
    };
    const advancedQuestions = advancedMap[task.category] || advancedMap.frontend;
    return advancedQuestions[Math.floor(Math.random() * advancedQuestions.length)];
  }

  async getQueueStatus(interviewId: string): Promise<{
    pendingTasks: number;
    completedCount: number;
    avgQuality: number;
  }> {
    const [pending, completed] = await Promise.all([
      this.prisma.taskAnswer.count({ where: { interviewId, answer: null } }),
      this.prisma.taskAnswer.findMany({ where: { interviewId, answer: { not: null } } }),
    ]);

    const qualities = completed
      .map((r) => (r.quality as AnswerQuality | null)?.score)
      .filter((s): s is number => s !== null && s !== undefined);

    const avgQuality = qualities.length > 0
      ? qualities.reduce((a, b) => a + b, 0) / qualities.length
      : 0;

    return { pendingTasks: pending, completedCount: completed.length, avgQuality };
  }

  async clearQueue(interviewId: string): Promise<void> {
    await this.prisma.taskAnswer.deleteMany({ where: { interviewId } });
  }

  async getAnswerHistory(interviewId: string): Promise<{ question: string; answer: string; quality: AnswerQuality }[]> {
    const rows = await this.prisma.taskAnswer.findMany({
      where: { interviewId, answer: { not: null } },
      orderBy: { answeredAt: 'asc' },
    });
    return rows.map((r) => ({
      question: r.question,
      answer: r.answer || '',
      quality: (r.quality as AnswerQuality) || { score: 0, completeness: 0, correctness: 0, depth: 0, feedback: '' },
    }));
  }
}
