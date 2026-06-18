/**
 * HITL Module - Human-In-The-Loop 最小版
 *
 * P1-5 修复：评分争议时人工介入
 */
import { Module } from '@nestjs/common';
import { HitlService } from './services/hitl.service';
import { HitlController } from './controllers/hitl.controller';

@Module({
  controllers: [HitlController],
  providers: [HitlService],
  exports: [HitlService],
})
export class HitlModule {}
