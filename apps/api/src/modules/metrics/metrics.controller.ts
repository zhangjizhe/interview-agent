import { Controller, Get, Post, Body, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { Public } from '../auth/public.decorator';
import { MetricsService } from './metrics.service';

@Controller('metrics')
@Public()
export class MetricsController {
  constructor(private metrics: MetricsService, private config: ConfigService) {}

  @Get()
  @SkipThrottle()
  async scrape(@Req() req: Request, @Res() res: Response) {
    const expected = this.config.get<string>('METRICS_TOKEN');
    const actual = req.headers.authorization || '';
    const expectedHeader = Buffer.from(`Bearer ${expected}`);
    const actualHeader = Buffer.from(actual);
    if (!expected || actualHeader.length !== expectedHeader.length || !timingSafeEqual(actualHeader, expectedHeader)) {
      throw new UnauthorizedException('Metrics authentication required');
    }
    res.setHeader('Content-Type', this.metrics.registry.contentType);
    res.setHeader('Cache-Control', 'no-store');
    res.send(await this.metrics.registry.metrics());
  }

  @Post('vitals')
  async reportVitals(@Body() body: { vitals?: unknown[] }) {
    // 保留旧端点合同；公开输入不作为指标标签或日志正文。
    return { ok: true, count: Array.isArray(body?.vitals) ? Math.min(body.vitals.length, 100) : 0 };
  }
}
