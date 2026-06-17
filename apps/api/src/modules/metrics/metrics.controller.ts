import { Controller, Post, Body, Logger } from '@nestjs/common';

interface VitalMetric {
  name: string;
  value: number;
  rating: string;
  delta: number;
  navigationType: string;
  url: string;
  timestamp: number;
}

@Controller('metrics')
export class MetricsController {
  private readonly logger = new Logger(MetricsController.name);

  @Post('vitals')
  async reportVitals(@Body() body: { vitals: VitalMetric[] }) {
    if (!body?.vitals?.length) return { ok: true };

    for (const m of body.vitals) {
      this.logger.log(
        `[WebVitals] ${m.name}=${m.value.toFixed(1)}ms (${m.rating}) ` +
        `nav=${m.navigationType} url=${m.url}`,
      );
    }

    // TODO: 写入时序数据库（InfluxDB/Prometheus）或发送到 Langfuse
    return { ok: true, count: body.vitals.length };
  }
}
