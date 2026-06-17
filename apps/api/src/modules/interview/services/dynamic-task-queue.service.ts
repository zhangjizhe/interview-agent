import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Question, QuestionDocument } from '../schemas/question.schema';

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

@Injectable()
export class DynamicTaskQueueService {
  private readonly logger = new Logger(DynamicTaskQueueService.name);
  private taskQueue = new Map<string, InterviewTask[]>();
  private answerHistory = new Map<string, { question: string; answer: string; quality: AnswerQuality }[]>();

  constructor(@InjectModel(Question.name) private questionModel: Model<QuestionDocument>) {}

  async initializeQueue(interviewId: string, position: string, level: string): Promise<void> {
    const initialQuestions = await this.generateInitialQuestions(position, level);
    const tasks: InterviewTask[] = initialQuestions.map((q, index) => ({
      id: `${interviewId}-${index}`,
      type: 'question',
      question: q.question,
      category: q.category,
      difficulty: q.difficulty as 'easy' | 'medium' | 'hard',
      priority: index + 1,
      context: { position, level, questionId: q._id },
      createdAt: Date.now(),
    }));
    this.taskQueue.set(interviewId, tasks);
    this.answerHistory.set(interviewId, []);
    this.logger.debug(`[TaskQueue] Initialized queue for ${interviewId} with ${tasks.length} tasks`);
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
    const tasks = this.taskQueue.get(interviewId);
    if (!tasks || tasks.length === 0) return undefined;

    tasks.sort((a, b) => a.priority - b.priority);
    return tasks[0];
  }

  async completeTask(interviewId: string, taskId: string, answer: string): Promise<void> {
    const tasks = this.taskQueue.get(interviewId);
    if (!tasks) return;

    const taskIndex = tasks.findIndex((t) => t.id === taskId);
    if (taskIndex === -1) return;

    const task = tasks[taskIndex];
    const quality = await this.evaluateAnswer(task.question, answer);
    
    this.answerHistory.get(interviewId)?.push({
      question: task.question,
      answer,
      quality,
    });

    tasks.splice(taskIndex, 1);
    this.taskQueue.set(interviewId, tasks);

    await this.generateFollowUpTasks(interviewId, task, quality);
  }

  private async evaluateAnswer(question: string, answer: string): Promise<AnswerQuality> {
    const lengthScore = Math.min(answer.length / 200, 1);
    
    const keywords = this.extractKeywords(question);
    const keywordMatch = keywords.filter((k) => answer.includes(k)).length / keywords.length;
    
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

  private async generateFollowUpTasks(interviewId: string, completedTask: InterviewTask, quality: AnswerQuality): Promise<void> {
    const tasks = this.taskQueue.get(interviewId) || [];

    if (quality.score < 0.5) {
      const followUp = await this.createFollowUpQuestion(completedTask);
      if (followUp) {
        tasks.push({
          id: `${interviewId}-followup-${Date.now()}`,
          type: 'follow-up',
          question: followUp,
          category: completedTask.category,
          difficulty: completedTask.difficulty,
          priority: 1,
          context: { ...completedTask.context, followUpFrom: completedTask.id },
          createdAt: Date.now(),
        });
        this.logger.debug(`[TaskQueue] Added follow-up task for ${interviewId}`);
      }
    }

    if (quality.score > 0.8 && tasks.length < 8) {
      const advanced = await this.createAdvancedQuestion(completedTask);
      if (advanced) {
        const difficultyMap = { easy: 'medium', medium: 'hard', hard: 'hard' } as const;
        tasks.push({
          id: `${interviewId}-advanced-${Date.now()}`,
          type: 'question',
          question: advanced,
          category: completedTask.category,
          difficulty: difficultyMap[completedTask.difficulty],
          priority: tasks.length + 1,
          context: { ...completedTask.context, advanced: true },
          createdAt: Date.now(),
        });
        this.logger.debug(`[TaskQueue] Added advanced task for ${interviewId}`);
      }
    }

    this.taskQueue.set(interviewId, tasks);
  }

  private async createFollowUpQuestion(task: InterviewTask): Promise<string | null> {
    const followUps: Record<string, string[]> = {
      frontend: [
        '能举一个实际项目中的应用例子吗？',
        '这个概念在 React 18 中有什么变化？',
        '和其他类似的 API 相比有什么优势？',
      ],
      backend: [
        '在高并发场景下会有什么问题？如何优化？',
        '这个方案的时间复杂度和空间复杂度是多少？',
        '生产环境中需要注意哪些边界情况？',
      ],
      algorithm: [
        '有没有更优的解法？时间复杂度是多少？',
        '这个算法在最坏情况下的表现如何？',
        '如何证明这个算法的正确性？',
      ],
    };

    const categoryFollowUps = followUps[task.category] || followUps.frontend;
    return categoryFollowUps[Math.floor(Math.random() * categoryFollowUps.length)];
  }

  private async createAdvancedQuestion(task: InterviewTask): Promise<string | null> {
    const advancedMap: Record<string, string[]> = {
      frontend: [
        '如何在服务端渲染场景下应用这个概念？',
        '如果需要实现一个类似的功能，你会如何设计 API？',
        '这个概念和最新的前端技术趋势有什么联系？',
      ],
      backend: [
        '如何将这个方案扩展到分布式系统中？',
        '在云原生环境下会遇到哪些挑战？如何解决？',
        '这个方案的可观测性如何保证？',
      ],
      algorithm: [
        '这个算法如何并行化？',
        '在大规模数据场景下如何优化？',
        '有没有相关的论文或工业界实践可以参考？',
      ],
    };

    const advancedQuestions = advancedMap[task.category] || advancedMap.frontend;
    return advancedQuestions[Math.floor(Math.random() * advancedQuestions.length)];
  }

  async getQueueStatus(interviewId: string): Promise<{
    pendingTasks: number;
    completedCount: number;
    avgQuality: number;
  }> {
    const tasks = this.taskQueue.get(interviewId) || [];
    const history = this.answerHistory.get(interviewId) || [];
    
    const avgQuality = history.length > 0
      ? history.reduce((sum, h) => sum + h.quality.score, 0) / history.length
      : 0;

    return {
      pendingTasks: tasks.length,
      completedCount: history.length,
      avgQuality,
    };
  }

  async clearQueue(interviewId: string): Promise<void> {
    this.taskQueue.delete(interviewId);
    this.answerHistory.delete(interviewId);
  }

  async getAnswerHistory(interviewId: string): Promise<{ question: string; answer: string; quality: AnswerQuality }[]> {
    return this.answerHistory.get(interviewId) || [];
  }
}
