import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import 'multer';
import { InterviewAgentService, AgentContext } from '../agent/interview-agent.service';
import { MultiAgentService } from '../agent/multi-agent.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { MemoryService } from '../memory/memory.service';
import { ResumeParserService, ParsedResume, type ResumeAnalysis } from './services/resume-parser.service';
import { ResumeRAGService } from './services/resume-rag.service';
import { QuestionBankService } from './services/question-bank.service';
import { QuestionGeneratorService, type InterviewQuestion } from './services/question-generator.service';
import { ScoringService, type AnswerEvaluation, type InterviewReport } from './services/scoring.service';
import { LlmGatewayService } from '../llm/llm.gateway.service';
import { ChatMessage } from '../llm/providers/types';
import { pickQuestions, matchBank, type BankKey } from './knowledge-banks';

interface StartInterviewDto {
  userId: string;
  position: string;
  level?: string;
  resumeText?: string;
}

interface QuestionDto {
  questionId?: string;
  position: string;
  level?: string;
  category?: string;
  question: string;
  answer: string;
  tags?: string[];
}

interface MessageDto {
  userId: string;
  position: string;
  level?: string;
  resumeText?: string;
}

interface MessageDto {
  userId: string;
  content: string;
}

@Controller('interview')
export class InterviewController {
  private readonly logger = new Logger(InterviewController.name);

  constructor(
    private agent: InterviewAgentService,
    private multiAgent: MultiAgentService,
    private prisma: PrismaService,
    private memory: MemoryService,
    private resumeParser: ResumeParserService,
    private resumeRag: ResumeRAGService,
    private questionBank: QuestionBankService,
    private questionGenerator: QuestionGeneratorService,
    private scoring: ScoringService,
    private llm: LlmGatewayService,
  ) { }

  // ===== 静态路由（必须在 :interviewId 之前）=====

  @Get('list')
  async listInterviews(@Query('userId') userId: string) {
    if (!userId) return [];
    const user = await this.prisma.user.findUnique({
      where: { email: `${userId}@demo.local` },
    });
    if (!user) return [];
    const interviews = await this.prisma.interview.findMany({
      where: { userId: user.id },
      orderBy: { startedAt: 'desc' },
      include: { report: true, messages: true },
    });
    const resumes = await this.resumeRag.searchByUser(user.id, 1).catch(() => []);
    const latest = resumes[0] || null;
    return interviews.map((iv) => ({
      ...iv,
      display: {
        resumeName: latest?.name || null,
        summary: latest?.summary || null,
        position: iv.position,
        level: iv.level,
        startedAt: iv.startedAt,
        status: iv.status,
        reportScore: iv.report?.overallScore ?? null,
      },
    }));
  }

  @Get('stats')
  async tokenStats(@Query('userId') userId: string) {
    if (!userId) return { totalTokens: 0, totalInterviews: 0 };
    const user = await this.prisma.user.findUnique({
      where: { email: `${userId}@demo.local` },
    });
    if (!user) {
      return { totalTokens: 0, totalPrompt: 0, totalCompletion: 0, totalInterviews: 0, completedInterviews: 0 };
    }

    const interviews = await this.prisma.interview.findMany({
      where: { userId: user.id },
      include: { messages: true },
    });

    let totalTokens = 0;
    let totalPrompt = 0;
    let totalCompletion = 0;
    for (const iv of interviews) {
      for (const m of iv.messages) {
        totalPrompt += m.promptTokens || 0;
        totalCompletion += m.completionTokens || 0;
      }
    }
    totalTokens = totalPrompt + totalCompletion;

    return {
      totalTokens,
      totalPrompt,
      totalCompletion,
      totalInterviews: interviews.length,
      completedInterviews: interviews.filter((i) => i.status === 'COMPLETED').length,
    };
  }

  /**
   * 简历上传 + 解析 + 自动生成面试题
   * 支持 PDF / DOC / DOCX / TXT / MD
   */
  @Post('upload-resume')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async uploadResume(
    @UploadedFile() file: any,
    @Body('position') position: string,
    @Body('userId') userId?: string,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    if (!position) throw new BadRequestException('position is required');

    // 1. 解析简历（支持 PDF/DOC/DOCX/TXT/MD）
    const parsed: ParsedResume = await this.resumeParser.parse(file, position);

    // 2. 写入 Milvus（简历 RAG）
    if (userId) {
      try {
        await this.resumeRag.ingestResume(userId, position, parsed);
      } catch (err) {
        this.logger.warn(`Resume RAG ingest failed: ${err.message}`);
      }
    }

    // 3. 匹配知识库
    const bank: BankKey = matchBank(position);

    // 4. 基于简历生成个性化补充题
    const personalizedQuestions = await this.generateQuestionsFromResume(parsed, position, bank);

    return {
      parsed,
      bank,
      standardQuestions: pickQuestions(bank, 5),
      personalizedQuestions,
      totalQuestions: 5 + personalizedQuestions.length,
      ragIngested: !!userId,
    };
  }

  @Get('resumes/:userId')
  async getUserResumes(@Param('userId') userId: string) {
    // 直接按 demo userId 查（与 ingest 写入的 userId 一致），同时返回真实 Prisma userId 便于后续关联
    const realUserId = await this.resolveUserId(userId);
    const resumes = await this.resumeRag.searchByUser(userId, 10);
    return { userId: realUserId || userId, resumes, count: resumes.length };
  }

  @Post('start')
  async startInterview(@Body() dto: StartInterviewDto) {
    const email = `${dto.userId}@demo.local`;
    const user = await this.prisma.user.upsert({
      where: { email },
      create: { email, name: dto.userId },
      update: {},
    });

    // 必须先上传简历（查询 Milvus resumes collection，userId 用 demo 字符串以匹配 ingest）
    const resumes = await this.resumeRag.searchByUser(dto.userId, 1).catch(() => []);
    if (resumes.length === 0) {
      throw new BadRequestException(
        '请先上传简历（支持 .pdf / .md / .txt 格式）',
      );
    }

    const interview = await this.prisma.interview.create({
      data: {
        userId: user.id,
        position: dto.position,
        level: dto.level || 'P5',
        status: 'IN_PROGRESS',
        summary: resumes[0]?.name ? `候选：${resumes[0].name}` : null,
      },
    });
    return {
      interviewId: interview.id,
      interview,
      resume: resumes[0], // 简历摘要给前端展示确认面板
      resumeConfirmed: false, // 强制用户点确认才开始面试
    };
  }

  // ===== 面试题知识库 =====

  @Post('question-bank')
  async addQuestion(@Body() dto: QuestionDto) {
    const result = await this.questionBank.addQuestion({
      questionId: dto.questionId || `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      position: dto.position,
      level: dto.level || 'P5',
      category: dto.category || '通用',
      question: dto.question,
      answer: dto.answer,
      tags: (dto.tags || []).join('、'),
    });
    return { success: true, ...result };
  }

  @Post('question-bank/batch')
  async addQuestions(@Body() dto: { questions: QuestionDto[] }) {
    const result = await this.questionBank.addQuestions(
      (dto.questions || []).map((q) => ({
        questionId: q.questionId || `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        position: q.position,
        level: q.level || 'P5',
        category: q.category || '通用',
        question: q.question,
        answer: q.answer,
        tags: (q.tags || []).join('、'),
      })),
    );
    return { success: true, ...result };
  }

  @Get('question-bank/search')
  async searchQuestionBank(
    @Query('q') query: string,
    @Query('position') position?: string,
    @Query('level') level?: string,
    @Query('category') category?: string,
    @Query('limit') limit?: string,
  ) {
    if (!query) return { query: '', results: [], count: 0 };
    const results = await this.questionBank.search(query, {
      position,
      level,
      category,
      limit: limit ? parseInt(limit, 10) : 5,
    });
    return { query, position, level, category, results, count: results.length };
  }

  @Get('question-bank/list')
  async listQuestionBank(
    @Query('position') position?: string,
    @Query('limit') limit?: string,
  ) {
    const results = await this.questionBank.list(
      position,
      limit ? parseInt(limit, 10) : 20,
    );
    return { position, results, count: results.length };
  }

  @Delete('question-bank/:questionId')
  async deleteQuestionBank(@Param('questionId') questionId: string) {
    return this.questionBank.deleteQuestion(questionId);
  }

  /**
   * 从文件导入面试题（.md / .txt / .pdf）
   * 后端解析 → LLM 提取结构化 → 入库
   */
  @Post('question-bank/import-file')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async importQuestionBankFile(
    @UploadedFile() file: any,
    @Body('position') position: string,
    @Body('level') level?: string,
    @Body('category') category?: string,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    if (!position) throw new BadRequestException('position is required');
    const text = await this.resumeParser.parse(file); // 复用简历解析器
    const result = await this.questionBank.importQuestions({
      text: text.rawText,
      position,
      level,
      category,
      source: `file:${file.originalname}`,
    });
    return { success: true, ...result, filename: file.originalname };
  }

  /**
   * 从 URL 导入面试题（抓取网页文本 → LLM 提取 → 入库）
   */
  @Post('question-bank/import-url')
  async importQuestionBankUrl(
    @Body() dto: { url: string; position: string; level?: string; category?: string },
  ) {
    if (!dto.url) throw new BadRequestException('url is required');
    if (!dto.position) throw new BadRequestException('position is required');

    // 抓取网页 HTML
    let html = '';
    try {
      const resp = await fetch(dto.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; InterviewBot/1.0)' },
      });
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
      html = await resp.text();
    } catch (err: any) {
      throw new BadRequestException(`URL 抓取失败：${err.message}`);
    }

    // HTML → 纯文本（去 script / style / 标签）
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 20000); // 限长 20k

    const result = await this.questionBank.importQuestions({
      text,
      position: dto.position,
      level: dto.level,
      category: dto.category,
      source: `url:${dto.url}`,
    });
    return { success: true, ...result, url: dto.url };
  }

  // ===== 空面试清理 =====

  /**
   * 列出「30 分钟前开始、0 条消息、状态仍为 ACTIVE」的面试
   * 前端首页会调这个端点，弹窗让用户确认是否删除
   */
  @Get('empty-rooms')
  async listEmptyRooms(
    @Query('userId') userId: string,
    @Query('idleMinutes') idleMinutes?: string,
  ) {
    if (!userId) return { userId, emptyRooms: [], count: 0 };
    const user = await this.prisma.user.findUnique({
      where: { email: `${userId}@demo.local` },
    });
    if (!user) return { userId, emptyRooms: [], count: 0 };

    const minutes = idleMinutes ? parseInt(idleMinutes, 10) : 30;
    const threshold = new Date(Date.now() - minutes * 60 * 1000);

    // 找出：status=IN_PROGRESS + 0 条消息 + startedAt < threshold
    // v13 schema 没有 createdAt，用 startedAt 代替
    // _count 在 Prisma 5.22 + 该 schema 下不支持，改用 messages: { none: true } 表达"没有消息"
    const candidates = await this.prisma.interview.findMany({
      where: {
        userId: user.id,
        status: 'IN_PROGRESS',
        startedAt: { lt: threshold },
        messages: { none: {} },
      },
      orderBy: { startedAt: 'desc' },
    });

    const emptyRooms = candidates.map((c) => ({
      id: c.id,
      position: c.position,
      level: c.level,
      startedAt: c.startedAt.toISOString(),
      idleMinutes: Math.floor((Date.now() - c.startedAt.getTime()) / 60000),
    }));

    return { userId, idleMinutes: minutes, emptyRooms, count: emptyRooms.length };
  }

  /**
   * 直接删除指定面试（前端弹窗确认后调用）
   */
  @Delete(':interviewId')
  async deleteInterview(
    @Param('interviewId') interviewId: string,
    @Query('userId') userId?: string,
  ) {
    const interview = await this.prisma.interview.findUnique({
      where: { id: interviewId },
    });
    if (!interview) {
      return { deleted: false, reason: 'not_found' };
    }
    // 校验归属（防误删）
    if (userId) {
      const user = await this.prisma.user.findUnique({
        where: { email: `${userId}@demo.local` },
      });
      if (user && interview.userId !== user.id) {
        return { deleted: false, reason: 'forbidden' };
      }
    }
    await this.prisma.interview.delete({ where: { id: interviewId } });
    this.logger.log(`Deleted interview ${interviewId} (manual cleanup)`);
    return { deleted: true, reason: 'manual_cleanup' };
  }

  /**
   * 查看 LangGraph thread 状态（断点续跑 + 历史 step）
   * GET /interview/:interviewId/checkpoint
   */
  @Get(':interviewId/checkpoint')
  async getCheckpoint(@Param('interviewId') interviewId: string) {
    if (!this.multiAgent.isEnabled()) {
      return { enabled: false };
    }
    const state = await this.multiAgent.getState(interviewId);
    const checkpoints = await this.multiAgent.listCheckpoints(interviewId);
    return {
      enabled: true,
      threadId: interviewId,
      hasState: !!state,
      checkpointCount: checkpoints.length,
      // 最近 5 个 checkpoint 摘要
      recentCheckpoints: checkpoints.slice(0, 5).map((cp: any) => ({
        checkpointId: cp.config?.configurable?.checkpoint_id,
        step: cp.metadata?.step,
        ts: cp.metadata?.ts,
        writes: cp.metadata?.writes,
      })),
      // 当前 state 摘要
      stateSnapshot: state
        ? {
          values: (state as any).values,
          next: (state as any).next,
          config: (state as any).config,
        }
        : null,
    };
  }

  // ===== 动态路由 =====

  @Get('memories/:userId')
  async getMemories(@Param('userId') userId: string) {
    const realUserId = await this.resolveUserId(userId);
    if (!realUserId) return { userId, memories: [], count: 0 };
    const memories = await this.memory.getAllMemories(realUserId);
    return { userId: realUserId, memories, count: memories.length };
  }

  private async resolveUserId(userId: string): Promise<string | null> {
    if (userId.includes('@') || userId.startsWith('cm')) return userId;
    const user = await this.prisma.user.findUnique({
      where: { email: `${userId}@demo.local` },
    });
    return user?.id || null;
  }

  @Get(':interviewId')
  async getInterview(@Param('interviewId') interviewId: string) {
    const interview = await this.prisma.interview.findUnique({
      where: { id: interviewId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        report: true,
      },
    });
    if (!interview) return null;
    // 用 user.email 反查 demo userId（与 ingest 写入的 userId 一致）
    const user = await this.prisma.user.findUnique({ where: { id: interview.userId } });
    const demoUserId = user?.email?.replace(/@demo\.local$/, '') || interview.userId;
    const resumes = await this.resumeRag.searchByUser(demoUserId, 1).catch(() => []);
    const latest = resumes[0] || null;
    return {
      ...interview,
      resume: latest ? {
        name: latest.name || null,
        position: latest.position,
        summary: latest.summary,
        skills: latest.skills,
        createdAt: latest.createdAt,
      } : null,
      resumeConfirmed: interview.resumeConfirmed,
    };
  }

  /**
   * 用户确认简历，开始面试
   * POST /interview/:interviewId/confirm-resume
   */
  @Post(':interviewId/confirm-resume')
  async confirmResume(@Param('interviewId') interviewId: string) {
    const interview = await this.prisma.interview.findUnique({ where: { id: interviewId } });
    if (!interview) {
      return { success: false, reason: 'not_found' };
    }
    await this.prisma.interview.update({
      where: { id: interviewId },
      data: { resumeConfirmed: true },
    });
    this.logger.log(`Resume confirmed for interview ${interviewId}`);
    return { success: true };
  }

  // ========== 简历解析 + 动态出题 + 评分（核心）==========

  /**
   * POST /interview/parse-resume
   * 解析简历文本，提取技能、岗位、经验等信息
   */
  @Post('parse-resume')
  async parseResumeText(@Body() dto: { text: string; position?: string }) {
    if (!dto.text || dto.text.trim().length < 20) {
      throw new BadRequestException('简历内容过短，请提供更完整的文本');
    }
    const analysis = await this.resumeParser.parse(dto.text, dto.position);
    return {
      name: analysis.name,
      email: analysis.email,
      position: analysis.position,
      yearsOfExperience: analysis.yearsOfExperience,
      skills: analysis.skills,
      education: analysis.education,
      experience: analysis.experience,
      projects: analysis.projects,
      keywords: analysis.keywords,
      seniority: analysis.seniority,
      summary: analysis.summary,
    };
  }

  /**
   * POST /interview/generate-questions
   * 基于简历分析动态生成个性化面试题
   */
  @Post('generate-questions')
  async generateInterviewQuestions(
    @Body() dto: { text: string; position?: string; count?: number },
  ) {
    if (!dto.text || dto.text.trim().length < 20) {
      throw new BadRequestException('简历内容过短');
    }

    // 1. 解析简历
    const analysis = await this.resumeParser.parse(dto.text, dto.position);

    // 2. 如果提供了岗位则覆盖，否则用解析器推断
    if (dto.position) {
      (analysis as any).position = dto.position;
    }

    // 3. 动态生成题目
    const questions = await this.questionGenerator.generateQuestions(
      analysis,
      dto.count || 8,
    );

    return {
      analysis: {
        name: analysis.name,
        position: analysis.position,
        seniority: analysis.seniority,
        skills: analysis.skills,
        yearsOfExperience: analysis.yearsOfExperience,
      },
      questions: questions.map((q) => ({
        id: q.id,
        question: q.question,
        category: q.category,
        difficulty: q.difficulty,
        expectedPoints: q.expectedPoints,
      })),
      totalQuestions: questions.length,
      difficultyDistribution: {
        easy: questions.filter((q) => q.difficulty === 'easy').length,
        medium: questions.filter((q) => q.difficulty === 'medium').length,
        hard: questions.filter((q) => q.difficulty === 'hard').length,
      },
    };
  }

  /**
   * POST /interview/:interviewId/generate-dynamic-questions
   * 面试过程中根据简历生成个性化题目（存入 interview 的题目池）
   */
  @Post(':interviewId/generate-dynamic-questions')
  async generateDynamicQuestions(
    @Param('interviewId') interviewId: string,
    @Body() dto: { resumeText: string; count?: number },
  ) {
    const interview = await this.prisma.interview.findUnique({ where: { id: interviewId } });
    if (!interview) throw new BadRequestException('Interview not found');

    const analysis = await this.resumeParser.parse(dto.resumeText, interview.position);
    const questions = await this.questionGenerator.generateQuestions(
      analysis,
      dto.count || 8,
    );

    return {
      success: true,
      interviewId,
      analysis: {
        position: analysis.position,
        skills: analysis.skills,
        seniority: analysis.seniority,
      },
      questions: questions.map((q) => ({
        id: q.id,
        question: q.question,
        category: q.category,
        difficulty: q.difficulty,
        followUpHints: q.followUpHints,
      })),
    };
  }

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
      expectedPoints: this.extractKeywordsFromQuestion(dto.question),
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
      expectedPoints: this.extractKeywordsFromQuestion(dto.question),
      followUpHints: [],
    };

    const evaluation = await this.scoring.evaluateAnswer(question, dto.answer);

    // 保存评估结果
    const saved = await this.prisma.answer.create({
      data: {
        interviewId,
        questionId: question.id,
        question: dto.question,
        answer: dto.answer,
        score: evaluation.score,
        feedback: evaluation.feedback,
        category: question.category,
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
        expectedPoints: this.extractKeywordsFromQuestion(pair.q),
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
          expectedPoints: this.extractKeywordsFromQuestion(dto.lastQuestion || ''),
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

      res.write('data: [DONE]\n\n');
      (res as any).flush?.();
      res.end();
    } catch (err) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: (err as Error).message })}\n\n`);
      (res as any).flush?.();
      res.end();
    }
  }

  @Post(':interviewId/end')
  async endInterview(@Param('interviewId') interviewId: string) {
    const interview = await this.prisma.interview.findUnique({
      where: { id: interviewId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!interview) {
      throw new BadRequestException('Interview not found');
    }

    // 空面试：直接删除（不保留无聊天记录的空面试）
    if (interview.messages.length === 0) {
      await this.prisma.interview.delete({ where: { id: interviewId } });
      this.logger.log(`Deleted empty interview ${interviewId} (no messages)`);
      return { deleted: true, reason: 'no messages' };
    }

    const conversation: ChatMessage[] = interview.messages.map((m) => ({
      role: m.role as any,
      content: m.content,
    }));

    const report = await this.agent.generateReport(
      {
        userId: interview.userId,
        sessionId: interviewId,
        position: interview.position,
        level: interview.level,
      },
      conversation,
    );

    const totalTokens = interview.messages.reduce(
      (sum, m) => sum + (m.promptTokens || 0) + (m.completionTokens || 0),
      0,
    );

    const saved = await this.prisma.report.upsert({
      where: { interviewId },
      create: {
        interviewId,
        overallScore: report.overallScore,
        scores: report.scores as any,
        strengths: report.strengths.join('\n'),
        weaknesses: report.weaknesses.join('\n'),
        suggestions: report.suggestions.join('\n'),
      },
      update: {
        overallScore: report.overallScore,
        scores: report.scores as any,
        strengths: report.strengths.join('\n'),
        weaknesses: report.weaknesses.join('\n'),
        suggestions: report.suggestions.join('\n'),
      },
    });

    // ===== 结构化归档：工作记忆 + 会话摘要写入长期记忆 =====
    const workingState = await this.memory.getWorkingState(interviewId);

    // 构建候选人画像（结构化数据）
    const user = await this.prisma.user.findUnique({ where: { id: interview.userId } });
    const demoUserId = user?.email?.replace(/@demo\.local$/, '') || '';
    const resumes = await this.resumeRag.searchByUser(demoUserId, 1).catch(() => []);
    const resume = resumes[0] || null;
    const endedAt = new Date();
    const durationMs = endedAt.getTime() - interview.startedAt.getTime();
    const durationMin = Math.max(1, Math.round(durationMs / 60000));
    const messageCount = interview.messages.length;

    // 候选人画像 - 用于写入长期记忆
    const candidateProfile = {
      userId: interview.userId,
      name: resume?.name || user?.name || '匿名',
      position: interview.position,
      level: interview.level,
      skills: [...(workingState.coveredSkills || []), ...(resume?.skills || [])],
      scoreHistory: workingState.scoreHistory || [],
      overallScore: report.overallScore,
      strengths: report.strengths,
      weaknesses: report.weaknesses,
      durationMin,
      messageCount,
      startedAt: interview.startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
    };

    // 将画像写入长期记忆（语义化存储）
    try {
      const profileContent = JSON.stringify(candidateProfile, null, 2);
      await this.memory.memorize(interview.userId, [
        { role: 'system', content: `【候选人画像】\n${profileContent}` },
        ...conversation.slice(-10), // 最后 10 条对话作为上下文
      ]);
      this.logger.log(`Archived candidate profile for ${interview.userId}`);
    } catch (err) {
      this.logger.error(`Failed to archive candidate profile: ${err.message}`);
    }

    // 更新面试状态
    await this.prisma.interview.update({
      where: { id: interviewId },
      data: {
        status: 'COMPLETED',
        endedAt: endedAt,
        summary: `总 token: ${totalTokens}, 得分: ${report.overallScore}`,
      },
    });

    // 清空短期记忆（可选：也可以保留一段时间供用户回看）
    // await this.memory.clearSession(interviewId);

    return {
      report: saved,
      ...report,
      totalTokens,
      candidate: {
        userId: demoUserId,
        name: resume?.name || user?.name || '匿名',
        position: interview.position,
        level: interview.level,
        startedAt: interview.startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        durationMin,
        messageCount,
        resumeName: resume?.name || null,
        resumeSkills: resume?.skills || null,
        coveredSkills: workingState.coveredSkills || [],
        questionIndex: workingState.questionIndex || 0,
      },
    };
  }

  // ===== 私有方法 =====

  private extractKeywordsFromQuestion(question: string): string[] {
    const techKeywords = [
      'react', 'vue', 'angular', 'javascript', 'typescript', 'node', 'python',
      'java', 'go', 'rust', 'docker', 'kubernetes', 'k8s', 'redis', 'mysql',
      'postgresql', 'mongodb', 'kafka', '微服务', '分布式', '算法', '数据库',
      '缓存', '性能', '并发', '异步', '同步', 'rest', 'graphql', 'grpc',
      'http', 'https', 'tcp', 'udp', 'websocket', '前端', '后端', '全栈',
      'css', 'html', 'redux', 'zustand', 'hook', 'virtual dom', '状态管理',
      '机器学习', '深度学习', 'transformer', 'llm', '大模型', '向量', 'embedding',
      '工程化', '架构', '设计模式', '依赖注入', '控制反转', 'mvc', 'mvp', 'mvvm',
    ];
    const lowerQ = question.toLowerCase();
    return techKeywords.filter((k) => lowerQ.includes(k)).slice(0, 5);
  }

  private async generateQuestionsFromResume(
    parsed: ParsedResume,
    position: string,
    bank: BankKey,
  ): Promise<Array<{ question: string; reason: string }>> {
    const prompt = `你是一位资深面试官。请基于候选人的简历，为【${position}】岗位设计 3 道**个性化追问题**。

【候选人简历摘要】
- 姓名：${parsed.name || '未知'}
- 技能：${(parsed.skills || []).slice(0, 10).join('、')}
- 最近经历：${(parsed.experience || []).slice(0, 2).map((e) => `${e.title || ''}@${e.company || ''}`).join('；')}
- 项目：${(parsed.projects || []).slice(0, 2).map((p) => p.name).join('、')}

【要求】
1. 题目必须**针对简历中提到的具体技术栈或项目**（不能是通用题）
2. 每题配一个 reason（为什么针对他问）
3. 难度：1 易 + 1 中 + 1 硬

【输出 JSON】
\`\`\`json
{
  "questions": [
    { "question": "...", "reason": "因为候选人提到了 X 技术" }
  ]
}
\`\`\``;

    try {
      const res = await this.llm.chat({
        messages: [
          { role: 'system', content: '你是一个严格的面试官。' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
      });
      const match = res.content.match(/\{[\s\S]*\}/);
      if (!match) return [];
      const data = JSON.parse(match[0]);
      return data.questions || [];
    } catch (err) {
      return [];
    }
  }
}
