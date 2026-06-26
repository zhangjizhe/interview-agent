import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { QuestionBankService } from '../services/question-bank.service';
import { QuestionGeneratorService } from '../services/question-generator.service';
import { ResumeParserService } from '../services/resume-parser.service';
import { assertSafeExternalUrl } from './external-url.util';

interface QuestionDto {
  questionId?: string;
  position: string;
  level?: string;
  category?: string;
  question: string;
  answer: string;
  tags?: string[];
}

/**
 * 面试题知识库 CRUD + 动态生成
 *
 * 拆 controller 历史：原 InterviewController 1289 行，2026-06-23 按业务域拆为 5 个 controller。
 * 8 个 endpoint：addQuestion / addQuestions / search / list / delete / import-file / import-url /
 * generate-questions / generate-dynamic-questions。
 *
 * 路由顺序保证：所有静态路由（question-bank/...）都在 :interviewId 之前。
 */
@Controller('interview')
export class QuestionBankController {
  constructor(
    private questionBank: QuestionBankService,
    private questionGenerator: QuestionGeneratorService,
    private resumeParser: ResumeParserService,
    private prisma: PrismaService,
  ) {}

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

    // SSRF 防护：拒绝内网 / loopback / 非 https（修复 P0-3）
    assertSafeExternalUrl(dto.url);

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
}