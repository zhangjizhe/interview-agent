/**
 * GET /api/session/:id/cost - 会话级成本面板
 * 1 秒内返回（Redis + 轻量 DB read）
 */

import { Controller, Get, Param, Logger } from '@nestjs/common';
import { SessionCostTracker } from './session-cost.tracker';

@Controller('session')
export class SessionCostController {
  private readonly logger = new Logger(SessionCostController.name);

  constructor(private tracker: SessionCostTracker) {}

  /**
   * GET /api/session/:id/cost
   */
  @Get(':id/cost')
  async getCost(@Param('id') id: string) {
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
