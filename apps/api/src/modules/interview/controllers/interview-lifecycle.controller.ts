import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { InterviewAgentService } from '../../agent/interview-agent.service';
import { MultiAgentService } from '../../agent/multi-agent.service';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { MemoryService } from '../../memory/memory.service';
import { ResumeRAGService } from '../services/resume-rag.service';
import type { ChatMessage } from '../../llm/providers/types';
import { resolveUserId } from './user-resolver.util';

interface StartInterviewDto {
  userId: string;
  position: string;
  level?: string;
  resumeText?: string;
}

/**
 * 面试生命周期（列表 / 统计 / 启动 / 空房间 / 删除 / checkpoint / 记忆 / 详情 / 确认 / 结束）
 *
 * 拆 controller 历史：原 InterviewController 1289 行，2026-06-23 按业务域拆为 5 个 controller。
 * 9 个 endpoint：list / stats / start / empty-rooms / delete / checkpoint / memories / getById /
 * confirm-resume / end。
 *
 * 路由顺序保证：本 controller 的静态路由（list/stats/empty-rooms/memories）必须在 :interviewId
 * 之前；module 注册时 LifecycleController 排在最前面（NestJS 按 controller 注册顺序匹配）。
 *
 * 关联：resolveUserId 提到 util 文件，本 controller 和 ResumeController 共用。
 */
@Controller('interview')
export class InterviewLifecycleController {
  private readonly logger = new Logger(InterviewLifecycleController.name);

  constructor(
    private agent: InterviewAgentService,
    private multiAgent: MultiAgentService,
    private prisma: PrismaService,
    private memory: MemoryService,
    private resumeRag: ResumeRAGService,
  ) {}

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
  async tokenStats(@Query('userId') userId?: string) {
    let where: any = undefined;

    // 优先按 userId 过滤；找不到对应 user 时 fallback 到所有 demo-user-* 聚合
    // (前端 localStorage 可能切过多次 user，DB 里没这个 userId 时不直接返 0)
    if (userId) {
      const user = await this.prisma.user.findUnique({
        where: { email: `${userId}@demo.local` },
      });
      if (user) {
        where = { userId: user.id };
      } else {
        // fallback: 查所有 demo-user-* 前缀用户的总数据
        const demoUsers = await this.prisma.user.findMany({
          where: { email: { startsWith: 'demo-user-' } },
          select: { id: true },
        });
        where = { userId: { in: demoUsers.map((u) => u.id) } };
      }
    }

    const interviews = await this.prisma.interview.findMany({
      where,
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
   *
   * 归属校验：userId 必填，不传或查不到 user 一律拒绝——不留"跳过校验"的口子。
   * 修复 P0-4：之前 `if (userId)` 整个 if 块可被不传 userId 绕过，导致任何
   * 拿到 interviewId 的人都能删除任意面试。
   */
  @Delete(':interviewId')
  async deleteInterview(
    @Param('interviewId') interviewId: string,
    @Query('userId') userId?: string,
  ) {
    // 1) userId 必填：不传 → forbidden（防止任意人知道 interviewId 就能删）
    if (!userId) {
      return { deleted: false, reason: 'forbidden', message: 'userId required' };
    }

    const interview = await this.prisma.interview.findUnique({
      where: { id: interviewId },
    });
    if (!interview) {
      return { deleted: false, reason: 'not_found' };
    }

    // 2) 归属校验：user 查不到也视作 forbidden（不留"查不到就不校验"的口子）
    const user = await this.prisma.user.findUnique({
      where: { email: `${userId}@demo.local` },
    });
    if (!user || interview.userId !== user.id) {
      return { deleted: false, reason: 'forbidden' };
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
    const realUserId = await resolveUserId(this.prisma, userId);
    if (!realUserId) return { userId, memories: [], count: 0 };
    const memories = await this.memory.getAllMemories(realUserId);
    return { userId: realUserId, memories, count: memories.length };
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
    // 修复 2026-06-22：IN_PROGRESS interview 不返回 report，避免前端进入"已完成"页面
    // 而是显示聊天界面。COMPLETED 才返回 report 让前端展示报告。
    // 双层防御：后端是数据层（其他调用方也受益），前端是 UI 层（即使后端漏过滤也不显示）。
    const isCompleted = interview.status === 'COMPLETED';
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
      // IN_PROGRESS 时 report 字段置 null，前端 setReport(null) 不触发报告视图
      report: isCompleted ? interview.report : null,
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
      return { deleted: true, reason: 'no_messages' };
    }

    // 2026-06-23 修复：try/catch/finally 兜底 status='COMPLETED' 写入
    // 原 bug：generateReport → upsert report → memory.memorize → update status
    // 若 generateReport 或 memory 抛错，status 仍是 IN_PROGRESS，
    // 用户刷新页面看到 report=null + 聊天区 + textarea 可输入 → "二次进入还可点击"
    // 现在：try 块跑核心流程，catch 兜底生成错误报告，finally 强制 status=COMPLETED
    const conversation: ChatMessage[] = interview.messages.map((m) => ({
      role: m.role as any,
      content: m.content,
    }));
    const totalTokens = interview.messages.reduce(
      (sum, m) => sum + (m.promptTokens || 0) + (m.completionTokens || 0),
      0,
    );
    const endedAt = new Date();
    const durationMs = endedAt.getTime() - interview.startedAt.getTime();
    const durationMin = Math.max(1, Math.round(durationMs / 60000));

    let report: any;
    let savedReport: any;
    let workingState: any = { coveredSkills: [], scoreHistory: [] };
    let user: any = null;
    let resume: any = null;

    try {
      report = await this.agent.generateReport(
        {
          userId: interview.userId,
          sessionId: interviewId,
          position: interview.position,
          level: interview.level,
        },
        conversation,
      );

      savedReport = await this.prisma.report.upsert({
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

      // 候选人画像构建（失败不阻塞 status 更新）
      workingState = await this.memory.getWorkingState(interviewId);
      user = await this.prisma.user.findUnique({ where: { id: interview.userId } });
      const demoUserId = user?.email?.replace(/@demo\.local$/, '') || '';
      const resumes = await this.resumeRag.searchByUser(demoUserId, 1).catch(() => []);
      resume = resumes[0] || null;
    } catch (err: any) {
      // generateReport 失败：fallback 到"评估失败"占位 report，保证 status 仍能切到 COMPLETED
      this.logger.error(`[end] report generation failed: ${err.message}, fallback to error report`);
      report = {
        overallScore: 0,
        scores: { completeness: 0, correctness: 0, depth: 0 },
        strengths: [],
        weaknesses: [`生成报告失败：${err.message}`],
        suggestions: ['请稍后重试或联系管理员'],
      };
      savedReport = await this.prisma.report.upsert({
        where: { interviewId },
        create: {
          interviewId,
          overallScore: 0,
          scores: { error: err.message } as any,
          strengths: '',
          weaknesses: `生成报告失败：${err.message}`,
          suggestions: '请稍后重试或联系管理员',
        },
        update: {
          overallScore: 0,
          scores: { error: err.message } as any,
          strengths: '',
          weaknesses: `生成报告失败：${err.message}`,
          suggestions: '请稍后重试或联系管理员',
        },
      });
    } finally {
      // 无论 try/catch 结果如何，status 必须切到 COMPLETED
      // 这是关键：保证二次进入看到 status='COMPLETED'，前端正确显示报告 + 禁用输入
      await this.prisma.interview.update({
        where: { id: interviewId },
        data: {
          status: 'COMPLETED',
          endedAt,
          summary: `总 token: ${totalTokens}, 得分: ${report?.overallScore ?? 0}`,
        },
      });
      this.logger.log(`[end] interview ${interviewId} status=COMPLETED`);
    }

    // ===== 结构化归档：长期记忆（独立 try/catch，不影响主流程） =====
    try {
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
        messageCount: interview.messages.length,
        startedAt: interview.startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
      };
      await this.memory.memorize(interview.userId, [
        { role: 'system', content: `【候选人画像】\n${JSON.stringify(candidateProfile, null, 2)}` },
        ...conversation.slice(-10),
      ]);
      this.logger.log(`Archived candidate profile for ${interview.userId}`);
    } catch (err: any) {
      this.logger.error(`Failed to archive candidate profile: ${err.message}`);
    }

    return {
      report: savedReport,
      ...report,
      totalTokens,
      candidate: {
        userId: interview.userId,
        name: resume?.name || user?.name || '匿名',
        position: interview.position,
        level: interview.level,
        startedAt: interview.startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        durationMin,
        messageCount: interview.messages.length,
        resumeName: resume?.name || null,
        resumeSkills: resume?.skills || null,
        coveredSkills: workingState.coveredSkills || [],
        questionIndex: workingState.questionIndex || 0,
      },
    };
  }
}