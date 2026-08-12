/**
 * GET /api/session/:id/cost - 会话级成本面板
 * 1 秒内返回（Redis + 轻量 DB read）
 */

import { Controller, Get, Param, Logger, Req } from '@nestjs/common';
import { SessionCostTracker } from './session-cost.tracker';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { requireOwnedInterview } from '../../../common/ownership.util';

@Controller('session')
export class SessionCostController {
  private readonly logger = new Logger(SessionCostController.name);

  constructor(
    private tracker: SessionCostTracker,
    private prisma: PrismaService,
  ) {}

  /**
   * GET /api/session/:id/cost
   */
  @Get(':id/cost')
  async getCost(@Param('id') id: string, @Req() req: any) {
    await requireOwnedInterview(this.prisma, id, req.user.userId);
    const start = Date.now();
    const panel = await this.tracker.getCostPanel(id);
    const elapsed = Date.now() - start;
    this.logger.debug(`session cost panel: ${id} returned in ${elapsed}ms`);
    return {
      ...panel,
      responseTimeMs: elapsed,
    };
  }
}
