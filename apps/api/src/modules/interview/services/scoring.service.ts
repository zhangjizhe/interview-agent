import { Injectable, Logger } from '@nestjs/common';
import { InterviewQuestion } from './question-generator.service';

export interface AnswerEvaluation {
  questionId: string;
  question: string;
  answer: string;
  score: number; // 0-100
  correctness: number; // 0-1
  depth: number; // 0-1
  completeness: number; // 0-1
  keywordMatch: string[];
  feedback: string;
  improvementSuggestions: string[];
  /** 0-100 分数档 */
  grade: 'excellent' | 'good' | 'average' | 'poor';
}

export interface InterviewReport {
  /** 总分 = 累计得分 / 题目总数 × 100 */
  totalScore: number;
  /** 累计得分 */
  totalPoints: number;
  /** 回答题目数 */
  answeredCount: number;
  /** 题目总数（包含未回答的） */
  totalQuestions: number;
  /** 答对题目数（>= 60分算答对） */
  correctCount: number;
  /** 答对率 */
  accuracy: number;
  /** 各档占比 */
  gradeDistribution: {
    excellent: number;   // 85-100
    good: number;        // 70-84
    average: number;     // 55-69
    poor: number;        // 0-54
  };
  skillBreakdown: {
    skill: string;
    avgScore: number;
    questionCount: number;
    correctCount: number;
  }[];
  strengthAreas: string[];
  improvementAreas: string[];
  finalRecommendation: 'strong_hire' | 'hire' | 'borderline' | 'no_hire';
  summary: string;
  questionEvaluations: AnswerEvaluation[];
}

@Injectable()
export class ScoringService {
  private readonly logger = new Logger(ScoringService.name);

  // 及格线：60 分
  private readonly PASS_THRESHOLD = 60;
  // 各档阈值
  private readonly GRADE_THRESHOLDS = {
    excellent: 85,
    good: 70,
    average: 55,
  } as const;

  private readonly negativeKeywords = new Set([
    '不知道', '不会', '不清楚', '没做过', '没考虑过', '可能', '应该', '大概',
  ]);
  private readonly codeKeywords = new Set([
    'function', 'class', 'const', 'let', 'var', '=>', 'return',
    'if', 'for', 'while', 'async', 'await', 'def ', 'import ',
  ]);

  async evaluateAnswer(
    question: InterviewQuestion,
    answer: string,
  ): Promise<AnswerEvaluation> {
    const lowerAnswer = answer.toLowerCase().trim();

    const completeness = this.calculateCompleteness(lowerAnswer);
    const { score: correctness, matchedKeywords } = this.calculateCorrectness(question, lowerAnswer);
    const depth = this.calculateDepth(lowerAnswer);

    // 加权综合得分
    const score = Math.round(
      (completeness * 0.25 + correctness * 0.45 + depth * 0.30) * 100,
    );

    const grade = this.getGrade(score);
    const feedback = this.generateFeedback(score, question);
    const suggestions = this.generateSuggestions(question, score, lowerAnswer);

    return {
      questionId: question.id,
      question: question.question,
      answer,
      score,
      correctness: Math.round(correctness * 100) / 100,
      depth: Math.round(depth * 100) / 100,
      completeness: Math.round(completeness * 100) / 100,
      keywordMatch: matchedKeywords,
      feedback,
      improvementSuggestions: suggestions,
      grade,
    };
  }

  /**
   * 生成面试报告
   * - 总分 = 所有题目累计得分之和
   * - 答对率 = 答对题数 / 回答题数
   * - 各档占比 = 各档题数 / 回答题数
   */
  async generateReport(
    evaluations: AnswerEvaluation[],
    totalQuestions: number = 0,
  ): Promise<InterviewReport> {
    const answeredCount = evaluations.length;

    if (answeredCount === 0) {
      return {
        totalScore: 0,
        totalPoints: 0,
        answeredCount: 0,
        totalQuestions,
        correctCount: 0,
        accuracy: 0,
        gradeDistribution: { excellent: 0, good: 0, average: 0, poor: 0 },
        skillBreakdown: [],
        strengthAreas: [],
        improvementAreas: [],
        finalRecommendation: 'borderline',
        summary: '面试尚未完成，无法生成完整报告。',
        questionEvaluations: [],
      };
    }

    // 1. 累计总分
    const totalPoints = evaluations.reduce((sum, e) => sum + e.score, 0);

    // 2. 答对题数（>= 60 分）
    const correctCount = evaluations.filter((e) => e.score >= this.PASS_THRESHOLD).length;

    // 3. 准确率 = 答对题数 / 回答题数
    const accuracy = Math.round((correctCount / answeredCount) * 100);

    // 4. 各档占比
    const gradeDistribution = {
      excellent: evaluations.filter((e) => e.grade === 'excellent').length,
      good: evaluations.filter((e) => e.grade === 'good').length,
      average: evaluations.filter((e) => e.grade === 'average').length,
      poor: evaluations.filter((e) => e.grade === 'poor').length,
    };

    // 转换为百分比
    const gradePercentages = {
      excellent: Math.round((gradeDistribution.excellent / answeredCount) * 100),
      good: Math.round((gradeDistribution.good / answeredCount) * 100),
      average: Math.round((gradeDistribution.average / answeredCount) * 100),
      poor: Math.round((gradeDistribution.poor / answeredCount) * 100),
    };

    // 5. 技能拆解（按 category 聚合）
    const skillMap = new Map<string, { total: number; count: number; correct: number }>();
    for (const evalItem of evaluations) {
      const cat = evalItem.questionId.split('-')[1] || 'general';
      const existing = skillMap.get(cat) || { total: 0, count: 0, correct: 0 };
      skillMap.set(cat, {
        total: existing.total + evalItem.score,
        count: existing.count + 1,
        correct: existing.correct + (evalItem.score >= this.PASS_THRESHOLD ? 1 : 0),
      });
    }

    const skillBreakdown = Array.from(skillMap.entries()).map(([skill, data]) => ({
      skill,
      avgScore: Math.round(data.total / data.count),
      questionCount: data.count,
      correctCount: data.correct,
    }));

    // 6. 强项（>= 75 分的题）
    const strengthAreas = evaluations
      .filter((e) => e.score >= 75)
      .map((e) => e.question)
      .slice(0, 5);

    // 7. 弱项（< 60 分的题）
    const improvementAreas = evaluations
      .filter((e) => e.score < 60)
      .map((e) => e.question)
      .slice(0, 5);

    // 8. 综合评分（加权：总分占比 40%，准确率占比 30%，优秀率占比 30%）
    const totalScore = Math.round(
      totalPoints / answeredCount,
    );

    // 9. 录用建议
    let finalRecommendation: InterviewReport['finalRecommendation'] = 'borderline';
    if (totalScore >= 85 && accuracy >= 80) {
      finalRecommendation = 'strong_hire';
    } else if (totalScore >= 70 || accuracy >= 65) {
      finalRecommendation = 'hire';
    } else if (totalScore >= 55 || accuracy >= 50) {
      finalRecommendation = 'borderline';
    } else {
      finalRecommendation = 'no_hire';
    }

    const summary = this.generateSummary(totalScore, accuracy, strengthAreas, improvementAreas, gradePercentages);

    return {
      totalScore,
      totalPoints,
      answeredCount,
      totalQuestions: totalQuestions || answeredCount,
      correctCount,
      accuracy,
      gradeDistribution: gradePercentages,
      skillBreakdown,
      strengthAreas,
      improvementAreas,
      finalRecommendation,
      summary,
      questionEvaluations: evaluations,
    };
  }

  private calculateCompleteness(answer: string): number {
    if (answer.length < 10) return 0.2;

    const lengthScore = Math.min(answer.length / 200, 1);
    const sentenceCount = answer.split(/[。！？\n]/).filter((s) => s.trim().length > 5).length;
    const structureScore = Math.min(sentenceCount / 3, 1);

    return Math.min(0.5 * lengthScore + 0.5 * structureScore, 1);
  }

  private calculateCorrectness(
    question: InterviewQuestion,
    answer: string,
  ): { score: number; matchedKeywords: string[] } {
    const matchedKeywords: string[] = [];

    for (const keyword of question.expectedPoints) {
      if (answer.includes(keyword.toLowerCase())) {
        matchedKeywords.push(keyword);
      }
    }

    const keywordScore =
      question.expectedPoints.length > 0
        ? matchedKeywords.length / Math.min(question.expectedPoints.length, 3)
        : 0.5;

    const negativeCount = Array.from(this.negativeKeywords)
      .filter((k) => answer.includes(k)).length;
    const negativePenalty = negativeCount * 0.2;

    const score = Math.max(0, Math.min(1, keywordScore - negativePenalty));
    return { score, matchedKeywords };
  }

  private calculateDepth(answer: string): number {
    let depthScore = 0.3;

    const techSignals = [
      '原理', '机制', '底层', '源码', '架构', '设计',
      '性能', '并发', '一致性', '可用性', '扩展性',
      '复杂度', '时间复杂度', '空间复杂度', 'O(n', 'O(1',
      '缓存', '数据库', '索引', '事务', '锁',
      '异步', '同步', '阻塞', '非阻塞',
    ];
    const signalCount = techSignals.filter((s) => answer.includes(s)).length;
    depthScore += signalCount * 0.1;

    if (Array.from(this.codeKeywords).some((k) => answer.includes(k))) {
      depthScore += 0.15;
    }

    if (
      answer.includes('首先') || answer.includes('其次') || answer.includes('最后') ||
      answer.includes('优点') || answer.includes('缺点') || answer.includes('对比')
    ) {
      depthScore += 0.15;
    }

    if (answer.includes('我') && (answer.includes('项目') || answer.includes('实现') || answer.includes('经验'))) {
      depthScore += 0.1;
    }

    return Math.min(depthScore, 1);
  }

  private getGrade(score: number): AnswerEvaluation['grade'] {
    if (score >= this.GRADE_THRESHOLDS.excellent) return 'excellent';
    if (score >= this.GRADE_THRESHOLDS.good) return 'good';
    if (score >= this.GRADE_THRESHOLDS.average) return 'average';
    return 'poor';
  }

  private generateFeedback(score: number, question: InterviewQuestion): string {
    const grade = this.getGrade(score);
    const gradeText = { excellent: '优秀', good: '良好', average: '一般', poor: '较差' };

    if (grade === 'excellent') {
      return `【${gradeText[grade]}】回答完整准确，有深度有案例。`;
    }
    if (grade === 'good') {
      return `【${gradeText[grade]}】基本覆盖核心要点，可进一步展开。`;
    }
    if (grade === 'average') {
      return `【${gradeText[grade]}】部分关键点未覆盖，建议补充。`;
    }
    return `【${gradeText[grade]}】关键概念不够清晰，建议系统复习。`;
  }

  private generateSuggestions(question: InterviewQuestion, score: number, answer: string): string[] {
    const suggestions: string[] = [];

    if (score < 70 && question.expectedPoints.length > 0) {
      suggestions.push(`建议关注：${question.expectedPoints.slice(0, 3).join('、')}`);
    }

    if (score < 60) {
      suggestions.push('回答可以更结构化，采用"先原理、再应用、后对比"的框架');
    }

    if (answer.length < 50) {
      suggestions.push('可以适当展开，补充实际项目中的应用例子');
    }

    if (question.question.includes('区别') || question.question.includes('比较')) {
      suggestions.push('对比题建议用表格法：从定义、场景、优缺点对比');
    }

    if (question.question.includes('原理') || question.question.includes('机制')) {
      suggestions.push('原理题建议按：数据结构 → 操作流程 → 性能特征组织');
    }

    if (question.question.includes('设计') || question.question.includes('架构')) {
      suggestions.push('设计题建议从：需求分析 → 选型理由 → 权衡取舍 → 演进路径回答');
    }

    return suggestions.slice(0, 3);
  }

  private generateSummary(
    totalScore: number,
    accuracy: number,
    strengths: string[],
    improvements: string[],
    gradeDist: { excellent: number; good: number; average: number; poor: number },
  ): string {
    const gradeText = (g: number) => g >= 60 ? '优秀' : g >= 40 ? '良好' : g >= 20 ? '一般' : '较差';

    const scoreRating = totalScore >= 85 ? '非常优秀' : totalScore >= 70 ? '良好' : totalScore >= 55 ? '一般' : '需要加强';
    const accuracyText = accuracy >= 80 ? '很高' : accuracy >= 65 ? '较高' : accuracy >= 50 ? '一般' : '较低';

    const excellentText = gradeDist.excellent >= 50 ? '优秀率较高，' : '';
    const poorText = gradeDist.poor >= 30 ? '较差题目较多需注意' : '';

    const strengthText = strengths.length > 0
      ? `在${strengths.slice(0, 2).join('、')}方面表现扎实`
      : '各维度表现较为均衡';
    const improvementText = improvements.length > 0
      ? `在${improvements.slice(0, 2).join('、')}方面建议加强`
      : '';

    return `综合评分 ${totalScore} 分（${scoreRating}），准确率 ${accuracy}%（${accuracyText}）。${excellentText}${strengthText}，${improvementText}。${poorText}。整体${totalScore >= 70 ? '值得推荐' : totalScore >= 55 ? '需进一步考察' : '建议暂缓'}。`;
  }

  getRecommendationText(recommendation: InterviewReport['finalRecommendation']): string {
    const map = {
      strong_hire: '强烈推荐 ✓✓',
      hire: '推荐录用 ✓',
      borderline: '需要进一步考察',
      no_hire: '暂不推荐',
    };
    return map[recommendation];
  }
}
