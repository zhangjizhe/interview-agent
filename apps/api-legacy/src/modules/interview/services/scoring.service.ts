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
}

export interface InterviewReport {
  overallScore: number;
  skillBreakdown: {
    skill: string;
    score: number;
    questionCount: number;
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

  private readonly negativeKeywords = new Set(['不知道', '不会', '不清楚', '没做过', '没考虑过', '可能', '应该', '大概']);
  private readonly codeKeywords = new Set(['function', 'class', 'const', 'let', 'var', '=>', 'return', 'if', 'for', 'while', 'async', 'await']);

  async evaluateAnswer(
    question: InterviewQuestion,
    answer: string,
  ): Promise<AnswerEvaluation> {
    const lowerAnswer = answer.toLowerCase().trim();

    // 1. 完整性评分（基于长度和信息量）
    const completeness = this.calculateCompleteness(lowerAnswer);

    // 2. 正确性评分（基于关键词匹配 + 负面信号过滤）
    const { score: correctness, matchedKeywords } = this.calculateCorrectness(
      question,
      lowerAnswer,
    );

    // 3. 深度评分（基于技术术语、代码片段、架构思维的信号）
    const depth = this.calculateDepth(lowerAnswer);

    // 4. 加权综合得分
    const score = Math.round((completeness * 0.3 + correctness * 0.4 + depth * 0.3) * 100);

    // 5. 生成反馈
    const feedback = this.generateFeedback(score, question);
    const suggestions = this.generateSuggestions(question, score, lowerAnswer);

    return {
      questionId: question.id,
      question: question.question,
      answer,
      score,
      correctness,
      depth,
      completeness,
      keywordMatch: matchedKeywords,
      feedback,
      improvementSuggestions: suggestions,
    };
  }

  async generateReport(evaluations: AnswerEvaluation[]): Promise<InterviewReport> {
    if (evaluations.length === 0) {
      return {
        overallScore: 0,
        skillBreakdown: [],
        strengthAreas: [],
        improvementAreas: ['没有足够的答题记录进行评估'],
        finalRecommendation: 'borderline',
        summary: '面试尚未完成，无法生成完整报告。',
        questionEvaluations: [],
      };
    }

    // 综合得分
    const overallScore = Math.round(
      evaluations.reduce((sum, e) => sum + e.score, 0) / evaluations.length,
    );

    // 技能拆解（按 question.category 聚合）
    const skillMap = new Map<string, { total: number; count: number }>();
    for (const evalItem of evaluations) {
      const existing = skillMap.get(evalItem.question) || { total: 0, count: 0 };
      skillMap.set(evalItem.question, { total: existing.total + evalItem.score, count: existing.count + 1 });
    }

    const skillBreakdown = Array.from(skillMap.entries()).map(([skill, data]) => ({
      skill,
      score: Math.round(data.total / data.count),
      questionCount: data.count,
    }));

    // 强项和弱项
    const strengthAreas = evaluations.filter((e) => e.score >= 75).map((e) => e.question);
    const improvementAreas = evaluations.filter((e) => e.score < 60).map((e) => e.question);

    // 推荐结论
    let finalRecommendation: InterviewReport['finalRecommendation'] = 'borderline';
    if (overallScore >= 85) finalRecommendation = 'strong_hire';
    else if (overallScore >= 70) finalRecommendation = 'hire';
    else if (overallScore >= 55) finalRecommendation = 'borderline';
    else finalRecommendation = 'no_hire';

    const summary = this.generateSummary(overallScore, strengthAreas, improvementAreas);

    return {
      overallScore,
      skillBreakdown,
      strengthAreas: strengthAreas.slice(0, 5),
      improvementAreas: improvementAreas.slice(0, 5),
      finalRecommendation,
      summary,
      questionEvaluations: evaluations,
    };
  }

  private calculateCompleteness(answer: string): number {
    // 空答案 0 分
    if (answer.length < 10) return 0.2;

    // 基础长度得分（200字以上算完整）
    const lengthScore = Math.min(answer.length / 200, 1);

    // 句子数量得分（3句以上算完整说明）
    const sentenceCount = answer.split(/[。！？\n]/).filter((s) => s.trim().length > 5).length;
    const structureScore = Math.min(sentenceCount / 3, 1);

    // 综合
    return Math.min(0.5 * lengthScore + 0.5 * structureScore, 1);
  }

  private calculateCorrectness(question: InterviewQuestion, answer: string): {
    score: number;
    matchedKeywords: string[];
  } {
    const matchedKeywords: string[] = [];

    // 检查是否包含预期关键词
    for (const keyword of question.expectedPoints) {
      if (answer.includes(keyword.toLowerCase())) {
        matchedKeywords.push(keyword);
      }
    }

    // 关键词匹配比例
    const keywordScore = question.expectedPoints.length > 0
      ? matchedKeywords.length / Math.min(question.expectedPoints.length, 3)
      : 0.5;

    // 检测负面信号（不知道、不会等）
    const negativeCount = Array.from(this.negativeKeywords)
      .filter((k) => answer.includes(k))
      .length;
    const negativePenalty = negativeCount * 0.2;

    // 综合
    const score = Math.max(0, Math.min(1, keywordScore - negativePenalty));
    return { score, matchedKeywords };
  }

  private calculateDepth(answer: string): number {
    let depthScore = 0.3; // 基础分

    // 1. 是否包含技术术语/架构词汇
    const techSignals = [
      '原理', '机制', '底层', '源码', '架构', '设计',
      '性能', '并发', '一致性', '可用性', '扩展性',
      '复杂度', '时间复杂度', '空间复杂度', 'O(n', 'O(1',
      '缓存', '数据库', '索引', '事务', '锁',
      '异步', '同步', '阻塞', '非阻塞',
    ];
    const signalCount = techSignals.filter((s) => answer.includes(s)).length;
    depthScore += signalCount * 0.1;

    // 2. 是否包含代码
    if (Array.from(this.codeKeywords).some((k) => answer.includes(k))) {
      depthScore += 0.15;
    }

    // 3. 是否有结构化表达（分点、对比、优缺点）
    if (answer.includes('首先') || answer.includes('其次') || answer.includes('最后')
      || answer.includes('优点') || answer.includes('缺点') || answer.includes('对比')) {
      depthScore += 0.15;
    }

    // 4. 是否有例子/经验
    if (answer.includes('我') && (answer.includes('项目') || answer.includes('实现') || answer.includes('经验'))) {
      depthScore += 0.1;
    }

    return Math.min(depthScore, 1);
  }

  private generateFeedback(score: number, question: InterviewQuestion): string {
    if (score >= 85) return '回答优秀！完整准确，有深度。';
    if (score >= 70) return '回答良好，基本覆盖核心要点。';
    if (score >= 55) return '回答尚可，部分关键点未覆盖，建议补充。';
    if (score >= 40) return '回答较简略，关键概念不够清晰，建议深入理解。';
    return '回答需要加强，建议系统复习相关知识点。';
  }

  private generateSuggestions(question: InterviewQuestion, score: number, answer: string): string[] {
    const suggestions: string[] = [];

    if (score < 70 && question.expectedPoints.length > 0) {
      suggestions.push(`建议关注以下概念：${question.expectedPoints.slice(0, 3).join('、')}`);
    }

    if (score < 60) {
      suggestions.push('回答可以更结构化，采用"先原理、再应用、后对比"的框架');
    }

    if (answer.length < 50) {
      suggestions.push('可以适当展开，补充实际项目中的应用例子');
    }

    // 针对具体问题类型给出建议
    if (question.question.includes('区别') || question.question.includes('比较')) {
      suggestions.push('这类对比题建议用表格法：从定义、场景、优缺点三个维度对比');
    }

    if (question.question.includes('原理') || question.question.includes('机制')) {
      suggestions.push('原理题建议按照：数据结构 → 操作流程 → 性能特征的顺序来组织答案');
    }

    if (question.question.includes('设计') || question.question.includes('架构')) {
      suggestions.push('设计题建议从：需求分析 → 选型理由 → 权衡取舍 → 演进路径四个层次回答');
    }

    return suggestions.slice(0, 3);
  }

  private generateSummary(
    overallScore: number,
    strengths: string[],
    improvements: string[],
  ): string {
    const rating = overallScore >= 85 ? '非常优秀' : overallScore >= 70 ? '良好' : overallScore >= 55 ? '一般' : '需要加强';
    const strengthText = strengths.length > 0 ? `在${strengths.slice(0, 2).join('、')}方面展现了扎实的基础` : '有一定的技术认知';
    const improvementText = improvements.length > 0 ? `在${improvements.slice(0, 2).join('、')}方面需要进一步加强` : '各方面表现均衡';

    return `综合评分 ${overallScore} 分（${rating}）。候选人${strengthText}，${improvementText}。整体技术理解${overallScore >= 70 ? '较为系统' : '还需深化'}，建议${overallScore >= 70 ? '进一步考察系统设计能力' : '在基础概念和实战经验上继续积累'}。`;
  }

  getRecommendationText(recommendation: InterviewReport['finalRecommendation']): string {
    const map = {
      strong_hire: '强烈推荐',
      hire: '推荐录用',
      borderline: '需要进一步考察（建议增加一轮技术面）',
      no_hire: '暂不推荐',
    };
    return map[recommendation];
  }
}
