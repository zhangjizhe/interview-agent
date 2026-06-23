import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Post,
} from '@nestjs/common';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { ScoringService, type AnswerEvaluation } from '../services/scoring.service';
import type { InterviewQuestion } from '../services/question-generator.service';
import { extractKeywordsFromQuestion } from './keyword-extract.util';

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
  ) {
    const interview = await this.prisma.interview.findUnique({ where: { id: interviewId } });
    if (!interview) throw new BadRequestException('Interview not found');

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
   * 生成完整面试报告（综合评分）
   */
  @Post(':interviewId/generate-report')
  async generateInterviewReport(@Param('interviewId') interviewId: string) {
    const interview = await this.prisma.interview.findUnique({
      where: { id: interviewId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!interview) throw new BadRequestException('Interview not found');

    // 从问答对生成评估（假设 user 消息是问题、assistant 消息是回答；或用 evaluate 记录）
    const evaluations: AnswerEvaluation[] = [];

    // 成对提取 user 消息和 assistant 消息
    const questionAnswerPairs: Array<{ q: string; a: string }> = [];
    for (let i = 0; i < interview.messages.length - 1; i++) {
      if (interview.messages[i].role === 'user') {
        const nextMsg = interview.messages[i + 1];
        if (nextMsg && nextMsg.role === 'assistant') {
          questionAnswerPairs.push({
            q: interview.messages[i].content,
            a: nextMsg.content,
          });
        }
      }
    }

    for (const pair of questionAnswerPairs) {
      if (!pair.a || pair.a.trim().length < 5) continue;
      const question: InterviewQuestion = {
        id: `q-${Date.now()}-${Math.random()}`,
        category: 'general',
        difficulty: 'medium',
        question: pair.q,
        expectedPoints: extractKeywordsFromQuestion(pair.q),
        followUpHints: [],
      };
      const evalItem = await this.scoring.evaluateAnswer(question, pair.a);
      evaluations.push(evalItem);
    }

    if (evaluations.length === 0) {
      return {
        success: false,
        reason: 'no_valid_answers',
        message: '暂无足够的答题记录生成报告',
      };
    }

    const report = await this.scoring.generateReport(evaluations);

    // 保存报告到 DB
    const savedReport = await this.prisma.report.upsert({
      where: { interviewId },
      create: {
        interviewId,
        overallScore: report.overallScore,
        scores: report as any,
        strengths: report.strengthAreas.join('\n'),
        weaknesses: report.improvementAreas.join('\n'),
        suggestions: report.summary,
      },
      update: {
        overallScore: report.overallScore,
        scores: report as any,
        strengths: report.strengthAreas.join('\n'),
        weaknesses: report.improvementAreas.join('\n'),
        suggestions: report.summary,
      },
    });

    return {
      success: true,
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
      savedReportId: savedReport.id,
    };
  }
}