import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { ScoringService, type AnswerEvaluation } from '../services/scoring.service';
import type { InterviewQuestion } from '../services/question-generator.service';
import { extractKeywordsFromQuestion } from './keyword-extract.util';
import { requireOwnedInterview } from '../../../common/ownership.util';

/**
 * 面试评估（单题评分 / 面试过程评分 / 生成报告）
 *
 * 拆 controller 历史：原 InterviewController 1289 行，2026-06-23 按业务域拆为 5 个 controller。
 * 3 个 endpoint：evaluate-answer / :interviewId/evaluate-answer / :interviewId/generate-report。
 * 公用工具：extractKeywordsFromQuestion 从 InterviewController 私有方法提到 util 文件，
 * EvaluationController + InterviewFlowController 都用。
 */
@Controller('interview')
export class EvaluationController {
  constructor(
    private scoring: ScoringService,
    private prisma: PrismaService,
  ) {}

  /**
   * POST /interview/evaluate-answer
   * 评分单道题目回答
   */
  @Post('evaluate-answer')
  async evaluateAnswer(@Body() dto: { question: string; answer: string; category?: string }) {
    if (!dto.question || !dto.answer) {
      throw new BadRequestException('question and answer are required');
    }

    const question: InterviewQuestion = {
      id: `eval-${Date.now()}`,
      category: dto.category || 'general',
      difficulty: 'medium',
      question: dto.question,
      expectedPoints: extractKeywordsFromQuestion(dto.question),
      followUpHints: [],
    };

    const evaluation = await this.scoring.evaluateAnswer(question, dto.answer);
    return evaluation;
  }

  /**
   * POST /interview/:interviewId/evaluate-answer
   * 面试过程中评分并保存
   */
  @Post(':interviewId/evaluate-answer')
  async evaluateAnswerInInterview(
    @Param('interviewId') interviewId: string,
    @Body() dto: { question: string; answer: string; category?: string },
    @Req() req: any,
  ) {
    await requireOwnedInterview(this.prisma, interviewId, req.user.userId);

    const question: InterviewQuestion = {
      id: `eval-${Date.now()}`,
      category: dto.category || 'general',
      difficulty: 'medium',
      question: dto.question,
      expectedPoints: extractKeywordsFromQuestion(dto.question),
      followUpHints: [],
    };

    const evaluation = await this.scoring.evaluateAnswer(question, dto.answer);

    // 保存评估结果
    const saved = await this.prisma.answerHistory.create({
      data: {
        interviewId,
        question: dto.question,
        answer: dto.answer,
        score: evaluation.score,
        feedback: evaluation.feedback,
      },
    });

    return { ...evaluation, savedId: saved.id };
  }

  /**
   * POST /interview/:interviewId/generate-report
   * 生成预览报告，不写入正式 Report 或 CandidateSkillState。
   *
   * 正式评价只能由结束面试路径写入 EvaluationRun，再显式切换 Report 展示快照。
   */
  @Post(':interviewId/generate-report')
  async generateInterviewReport(@Param('interviewId') interviewId: string, @Req() req: any) {
    await requireOwnedInterview(this.prisma, interviewId, req.user.userId);
    const answerHistory = await this.prisma.answerHistory.findMany({
      where: { interviewId },
      orderBy: { createdAt: 'asc' },
    });

    // AnswerHistory is written by the task queue after each candidate answer.
    // Do not infer roles from chat messages: user messages are answers in this product.
    const evaluations: AnswerEvaluation[] = answerHistory.map((item) => ({
      questionId: item.id,
      question: item.question,
      answer: item.answer,
      score: Math.round(item.score <= 1 ? item.score * 100 : item.score),
      completeness: item.completeness,
      correctness: item.correctness,
      depth: item.depth,
      keywordMatch: [],
      feedback: item.feedback || '',
      improvementSuggestions: [],
    }));

    if (evaluations.length === 0) {
      return {
        success: false,
        reason: 'no_valid_answers',
        message: '暂无足够的答题记录生成报告',
      };
    }

    const report = await this.scoring.generateReport(evaluations);

    return {
      success: true,
      mode: 'PREVIEW',
      report: {
        overallScore: report.overallScore,
        recommendation: report.finalRecommendation,
        summary: report.summary,
        strengths: report.strengthAreas,
        improvements: report.improvementAreas,
        skillBreakdown: report.skillBreakdown,
      },
      evaluations: evaluations.map((e) => ({
        question: e.question,
        score: e.score,
        feedback: e.feedback,
      })),
    };
  }
}
