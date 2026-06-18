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
 * - POST /hitl/graph-resume/:interviewId - HR 审批后恢复图执行
 */
import { Controller, Get, Post, Param, Body, UseGuards, Req } from '@nestjs/common';
import { HitlService } from '../services/hitl.service';
import { MultiAgentService } from '../../agent/multi-agent.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';

@Controller('hitl')
export class HitlController {
  constructor(
    private hitl: HitlService,
    private multiAgent: MultiAgentService,
  ) {}

  // ===== 基础版（Redis pending）=====

  /**
   * 获取某个面试的 pending 状态
   */
  @Get('pending/:interviewId')
  async getPending(@Param('interviewId') interviewId: string) {
    const pending = await this.hitl.getPending(interviewId);
    return { hasPending: !!pending, pending };
  }

  /**
   * HR 审批通过
   */
  @Post('approve/:interviewId')
  @UseGuards(JwtAuthGuard)
  async approve(@Param('interviewId') interviewId: string, @Req() req: any) {
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
    const reviewerId = req.user?.userId || 'hr-system';
    const success = await this.hitl.reject(interviewId, reviewerId);
    return { success, message: success ? 'Rejected' : 'No pending HITL found' };
  }

  /**
   * 获取所有 pending 的 HITL（HR dashboard）
   */
  @Get('all')
  @UseGuards(JwtAuthGuard)
  async getAllPending() {
    const pending = await this.hitl.getAllPending();
    return { count: pending.length, pending };
  }

  // ===== LangGraph interrupt 联动版 =====

  /**
   * 检查图是否处于 HITL 中断状态
   * GET /hitl/graph-status/:interviewId
   */
  @Get('graph-status/:interviewId')
  async getGraphHitlStatus(@Param('interviewId') interviewId: string) {
    const status = await this.multiAgent.checkHitlStatus(interviewId);
    return status;
  }

  /**
   * HR 审批后恢复图执行
   * POST /hitl/graph-resume/:interviewId
   * Body: { verdict: 'approved' | 'rejected' }
   */
  @Post('graph-resume/:interviewId')
  @UseGuards(JwtAuthGuard)
  async graphResume(
    @Param('interviewId') interviewId: string,
    @Body() body: { verdict: 'approved' | 'rejected' },
    @Req() req: any,
  ) {
    if (!body.verdict || !['approved', 'rejected'].includes(body.verdict)) {
      return { success: false, message: 'verdict must be "approved" or "rejected"' };
    }

    // 同步更新 Redis HITL 状态
    const reviewerId = req.user?.userId || 'hr-system';
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
