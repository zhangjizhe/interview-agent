import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { LlmGatewayService } from '../../llm/llm.gateway.service';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { ResumeParserService, type ParsedResume } from '../services/resume-parser.service';
import { ResumeRAGService } from '../services/resume-rag.service';
import { matchBank, pickQuestions, type BankKey } from '../knowledge-banks';
import { resolveUserId } from './user-resolver.util';

/**
 * 简历管理（上传 / 解析 / 列表）
 *
 * 拆 controller 历史：原 InterviewController 1289 行，2026-06-23 按业务域拆为 5 个 controller。
 * 3 个 endpoint：upload-resume / resumes/:userId / parse-resume。
 * 私有方法：generateQuestionsFromResume（仅 uploadResume 用，保留在本 controller）。
 */
@Controller('interview')
export class ResumeController {
  private readonly logger = new Logger(ResumeController.name);

  constructor(
    private resumeParser: ResumeParserService,
    private resumeRag: ResumeRAGService,
    private llm: LlmGatewayService,
    private prisma: PrismaService,
  ) {}

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
      } catch (err: any) {
        this.logger.warn(`Resume RAG ingest failed: ${err.message}`);
      }
    }

    // 3. 匹配知识库
    const bank: BankKey = matchBank(position);

    // 4. 基于简历生成个性化补充题
    const personalizedQuestions = await this.generateQuestionsFromResume(parsed, position, bank, userId);

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
    const realUserId = await resolveUserId(this.prisma, userId);
    const resumes = await this.resumeRag.searchByUser(userId, 10);
    return { userId: realUserId || userId, resumes, count: resumes.length };
  }

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
   * 基于简历生成个性化补充题（私有，仅 uploadResume 调用）
   */
  private async generateQuestionsFromResume(
    parsed: ParsedResume,
    position: string,
    bank: BankKey,
    userId?: string,
  ): Promise<Array<{ question: string; reason: string }>> {
    const prompt = `你是一位资深面试官。请基于候选人的简历，为【${position}】岗位设计 3 道**个性化追问题**。

【候选人简历摘要】
- 姓名：${parsed.name || '未知'}
- 技能：${(parsed.skills || []).slice(0, 10).join('、')}
- 最近经历：${(parsed.experience || []).slice(0, 2).join('；')}
- 项目：${(parsed.projects || []).slice(0, 2).join('、')}

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
        // 2026-06-24 修复：传 userId 给 llm.chat
        // interviewId 此时还没有（resume 上传先于 interview 创建），
        // 走 SessionCostTracker 防御性 guard 直接 skip cost tracking
        userId: userId || 'anonymous',
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