/**
 * HITL Controller - HR 审批接口
 *
 * P1-5 修复：评分争议时人工介入
 * - GET /hitl/pending/:interviewId - 获取 pending 状态
 * - POST /hitl/approve/:interviewId - HR 审批通过
 * - POST /hitl/reject/:interviewId - HR 审批拒绝
 * - GET /hitl/all - 获取所有 pending（HR dashboard）
 */
import { Controller, Get, Post, Param, Body, UseGuards, Req } from '@nestjs/common';
import { HitlService } from '../services/hitl.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';

@Controller('hitl')
export class HitlController {
  constructor(private hitl: HitlService) {}

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
}
