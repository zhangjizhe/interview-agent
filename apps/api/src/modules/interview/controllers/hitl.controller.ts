/**
 * HITL Controller - HR 审批接口（含 LangGraph interrupt 联动）
 *
 * 基础版（Redis pending）：
 * - GET /hitl/pending/:interviewId - 获取 pending 状态
 * - POST /hitl/approve/:interviewId - HR 审批通过
 * - POST /hitl/reject/:interviewId - HR 审批拒绝
 * - GET /hitl/all - 获取所有 pending（HR dashboard）
 *
 * LangGraph interrupt 联动版：
 * - GET /hitl/graph-status/:interviewId - 检查图是否处于 HITL 中断状态
 * - POST /hitl/graph-resume/:interviewId - 当前会话所有者审批后恢复图执行
 */
import { Controller, Get, Post, Param, Body, UseGuards, Req, NotFoundException } from '@nestjs/common';
import { HitlService } from '../services/hitl.service';
import { MultiAgentService } from '../../agent/multi-agent.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { requireOwnedInterview } from '../../../common/ownership.util';

@Controller('hitl')
export class HitlController {
  constructor(
    private hitl: HitlService,
    private multiAgent: MultiAgentService,
    private prisma: PrismaService,
  ) {}

  // ===== 基础版（Redis pending）=====

  /**
   * 获取某个面试的 pending 状态
   */
  @Get('pending/:interviewId')
  async getPending(@Param('interviewId') interviewId: string, @Req() req: any) {
    await requireOwnedInterview(this.prisma, interviewId, req.user.userId);
    const pending = await this.hitl.getPending(interviewId);
    return { hasPending: !!pending, pending };
  }

  /**
   * HR 审批通过
   */
  @Post('approve/:interviewId')
  @UseGuards(JwtAuthGuard)
  async approve(@Param('interviewId') interviewId: string, @Req() req: any) {
    await requireOwnedInterview(this.prisma, interviewId, req.user.userId);
    const reviewerId = req.user?.userId || 'hr-system';
    const success = await this.hitl.approve(interviewId, reviewerId);
    return { success, message: success ? 'Approved' : 'No pending HITL found' };
  }

  /**
   * HR 审批拒绝
   */
  @Post('reject/:interviewId')
  @UseGuards(JwtAuthGuard)
  async reject(@Param('interviewId') interviewId: string, @Req() req: any) {
    await requireOwnedInterview(this.prisma, interviewId, req.user.userId);
    const reviewerId = req.user?.userId || 'hr-system';
    const success = await this.hitl.reject(interviewId, reviewerId);
    return { success, message: success ? 'Rejected' : 'No pending HITL found' };
  }

  /**
   * 获取所有 pending 的 HITL（HR dashboard）
   */
  @Get('all')
  @UseGuards(JwtAuthGuard)
  async getAllPending(@Req() req: any) {
    const pending = await this.hitl.getAllPending();
    const owned = [];
    for (const item of pending) {
      const interview = await this.prisma.interview.findFirst({
        where: { id: item.interviewId, userId: req.user.userId },
        select: { id: true },
      });
      if (interview) owned.push(item);
    }
    return { count: owned.length, pending: owned };
  }

  // ===== LangGraph interrupt 联动版 =====

  /**
   * 检查图是否处于 HITL 中断状态
   * GET /hitl/graph-status/:interviewId
   */
  @Get('graph-status/:interviewId')
  async getGraphHitlStatus(@Param('interviewId') interviewId: string, @Req() req: any) {
    await requireOwnedInterview(this.prisma, interviewId, req.user.userId);
    const status = await this.multiAgent.checkHitlStatus(interviewId);
    return status;
  }

  /**
   * HR 审批后恢复图执行
   * POST /hitl/graph-resume/:interviewId
   * Body: { verdict: 'approved' | 'rejected' }
   * 仅面试所有者可恢复自己的图执行。
   */
  @Post('graph-resume/:interviewId')
  async graphResume(
    @Param('interviewId') interviewId: string,
    @Body() body: { verdict: 'approved' | 'rejected' },
    @Req() req: any,
  ) {
    await requireOwnedInterview(this.prisma, interviewId, req.user.userId);
    if (!body.verdict || !['approved', 'rejected'].includes(body.verdict)) {
      return { success: false, message: 'verdict must be "approved" or "rejected"' };
    }

    // 同步更新 Redis HITL 状态
    const reviewerId = 'interviewee'; // 面试者自己审批
    if (body.verdict === 'approved') {
      await this.hitl.approve(interviewId, reviewerId);
    } else {
      await this.hitl.reject(interviewId, reviewerId);
    }

    // 恢复 LangGraph 图执行
    const result = await this.multiAgent.resumeAfterHitl(interviewId, body.verdict);
    return result;
  }
}
