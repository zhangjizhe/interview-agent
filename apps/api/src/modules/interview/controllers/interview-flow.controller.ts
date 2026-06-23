import {
  BadRequestException,
  Body,
  Controller,
  HttpStatus,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { InterviewAgentService, type AgentContext } from '../../agent/interview-agent.service';
import { QuestionGeneratorService } from '../services/question-generator.service';
import { ResumeParserService, type ResumeAnalysis } from '../services/resume-parser.service';
import { ScoringService } from '../services/scoring.service';
import type { InterviewQuestion } from '../services/question-generator.service';
import { extractKeywordsFromQuestion } from './keyword-extract.util';

interface MessageDto {
  userId: string;
  content: string;
}

/**
 * 面试流程控制（下一题 / 流式对话）
 *
 * 拆 controller 历史：原 InterviewController 1289 行，2026-06-23 按业务域拆为 5 个 controller。
 * 2 个 endpoint：:interviewId/next-question / :interviewId/message（SSE 流式）。
 *
 * SSE 流式说明：
 * - 默认走 multi 模式（LangGraph Supervisor 拓扑），graph.stream(streamMode='messages') 逐 token
 * - llm-direct 模式走 LlmGatewayService.streamChat
 * - LlmGatewayChatModel adapter 确保 multi 模式也经过 LlmGateway（P0 缓存层）
 *
 * 公用工具：extractKeywordsFromQuestion 从 InterviewController 私有方法提到 util 文件。
 */
@Controller('interview')
export class InterviewFlowController {
  constructor(
    private agent: InterviewAgentService,
    private questionGenerator: QuestionGeneratorService,
    private resumeParser: ResumeParserService,
    private scoring: ScoringService,
    private prisma: PrismaService,
  ) {}

  /**
   * POST /interview/:interviewId/next-question
   * 根据之前的表现动态决定下一题
   * - 如果上次回答质量高 → 提高难度
   * - 如果上次回答质量低 → 追问或降低难度
   */
  @Post(':interviewId/next-question')
  async getNextQuestion(
    @Param('interviewId') interviewId: string,
    @Body() dto: { lastQuestion?: string; lastAnswer?: string; resumeText?: string },
  ) {
    const interview = await this.prisma.interview.findUnique({ where: { id: interviewId } });
    if (!interview) throw new BadRequestException('Interview not found');

    // 如果有简历，基于简历动态出题
    if (dto.resumeText && dto.resumeText.trim().length > 50) {
      const analysis = await this.resumeParser.parse(dto.resumeText, interview.position);

      // 基于上次回答的质量决定难度
      let targetCount = 3;
      if (dto.lastAnswer) {
        const lastQuestion: InterviewQuestion = {
          id: 'last',
          category: 'general',
          difficulty: 'medium',
          question: dto.lastQuestion || '',
          expectedPoints: extractKeywordsFromQuestion(dto.lastQuestion || ''),
          followUpHints: [],
        };
        const evalItem = await this.scoring.evaluateAnswer(lastQuestion, dto.lastAnswer);

        // 质量低 → 先追问
        if (evalItem.score < 50) {
          const followUp = await this.questionGenerator.generateFollowUp(
            dto.lastQuestion || '',
            dto.lastAnswer,
            evalItem.score,
          );
          if (followUp) {
            return {
              type: 'follow-up',
              question: followUp,
              reason: `上一题得分 ${evalItem.score}，需要深入追问`,
              lastEvaluation: { score: evalItem.score, feedback: evalItem.feedback },
            };
          }
        }
      }

      // 正常出题
      const questions = await this.questionGenerator.generateQuestions(
        analysis,
        targetCount,
      );
      return {
        type: 'question',
        question: questions[0]?.question || '',
        category: questions[0]?.category || 'general',
        allQuestions: questions.map((q) => ({
          id: q.id,
          question: q.question,
          category: q.category,
          difficulty: q.difficulty,
        })),
        analysis: {
          position: analysis.position,
          skills: analysis.skills.slice(0, 5),
          seniority: analysis.seniority,
        },
      };
    }

    // 没有简历 → 走简单模式（返回通用面试题）
    const questions = await this.questionGenerator.generateQuestions(
      {
        name: '候选人',
        email: '',
        position: interview.position,
        yearsOfExperience: 3,
        skills: [interview.position],
        education: [],
        experience: [],
        projects: [],
        keywords: [],
        summary: '',
        seniority: 'mid',
      } as ResumeAnalysis,
      3,
    );

    return {
      type: 'question',
      question: questions[0]?.question || '',
      category: questions[0]?.category || 'general',
      allQuestions: questions.map((q) => ({
        id: q.id,
        question: q.question,
        category: q.category,
        difficulty: q.difficulty,
      })),
    };
  }

  @Post(':interviewId/message')
  async streamMessage(
    @Param('interviewId') interviewId: string,
    @Body() dto: MessageDto,
    @Res() res: Response,
  ) {
    res.status(HttpStatus.OK);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // R-P2-20 修复：user message 长度上限 10000 字符（约 2000-3000 tokens）。
    // 原 Prisma @db.Text 无限制，恶意用户可发超长消息导致 DB / LLM 上下文压力。
    // 限制后用 SSE error event 通知前端，不静默吞。
    const MAX_USER_MESSAGE_CHARS = 10000;
    if (!dto.content || typeof dto.content !== 'string' || dto.content.length === 0) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: '消息内容不能为空' })}\n\n`);
      (res as any).flush?.();
      res.end();
      return;
    }
    if (dto.content.length > MAX_USER_MESSAGE_CHARS) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: `消息超过 ${MAX_USER_MESSAGE_CHARS} 字符限制（当前 ${dto.content.length}）` })}\n\n`);
      (res as any).flush?.();
      res.end();
      return;
    }

    const interview = await this.prisma.interview.findUnique({
      where: { id: interviewId },
    });
    if (!interview) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'Interview not found' })}\n\n`);
      (res as any).flush?.();
      res.end();
      return;
    }

    await this.prisma.message.create({
      data: { interviewId, role: 'user', content: dto.content },
    });

    const ctx: AgentContext = {
      userId: interview.userId,
      sessionId: interviewId,
      position: interview.position,
      level: interview.level,
      // P0-3 修复：传 provider，让 maxTokens 走对应 provider 配置
      provider: (dto as any).provider || 'qwen',
    };

    const writeEvent = (event: object) => {
      const ok = res.write(`data: ${JSON.stringify(event)}\n\n`);
      (res as any).flush?.();
      if (!ok) return new Promise<void>((r) => res.once('drain', r));
      return Promise.resolve();
    };

    let fullResponse = '';

    // 默认走 multi 模式（LangGraph Supervisor 拓扑），SSE 流式逐 token 推送
    // 路径：processMessage → MultiAgentService.stream → graph.stream(streamMode='messages')
    // LlmGatewayChatModel adapter 确保 multi 模式也经过 LlmGateway（P0 缓存层）
    // llm-direct 模式走 LlmGatewayService.streamChat（纯 LLM，无 Agent 拓扑）
    try {
      for await (const event of this.agent.processMessage(ctx, dto.content)) {
        if (event.type === 'token' && event.content) {
          fullResponse += event.content;
        }
        await writeEvent(event);
      }

      const totalPrompt = Math.ceil((dto.content.length + fullResponse.length * 0.3) / 2);
      const totalCompletion = Math.ceil(fullResponse.length / 2);

      if (fullResponse) {
        await this.prisma.message.create({
          data: {
            interviewId,
            role: 'assistant',
            content: fullResponse,
            promptTokens: totalPrompt,
            completionTokens: totalCompletion,
          },
        });
        await writeEvent({
          type: 'token_usage',
          promptTokens: totalPrompt,
          completionTokens: totalCompletion,
          total: totalPrompt + totalCompletion,
        });
      }

      // 2026-06-23 修复：等 [DONE] 真正 flush 到 TCP 再 res.end()
      // 之前的 res.end() 是异步的,不等 res.write 完成,客户端可能 fetch done=true
      // 早于 [DONE] 到达,前端 setStreaming(false) 路径失效,按钮一直 loading。
      // 现在用 Promise 包装 res.end(),等 socket 真正关闭。
      await new Promise<void>((resolve) => {
        res.write('data: [DONE]\n\n');
        (res as any).flush?.();
        res.end(() => resolve());
      });
    } catch (err: any) {
      // 错误路径也要等 flush 完成
      await new Promise<void>((resolve) => {
        res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
        (res as any).flush?.();
        res.end(() => resolve());
      });
    }
  }
}