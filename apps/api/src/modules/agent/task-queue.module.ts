import { Module } from '@nestjs/common';
import { DynamicTaskQueueService } from '../interview/services/dynamic-task-queue.service';
import { LlmModule } from '../llm/llm.module';
import { MemoryModule } from '../memory/memory.module';

/**
 * TaskQueueModule - 抽取 DynamicTaskQueueService
 *
 * 原问题：DynamicTaskQueueService 在 interview/ 模块，被 agent/ 和 interview/ 双向依赖（循环）
 * 解法：单独建模块，双方都导入这个
 */
@Module({
  imports: [LlmModule, MemoryModule],
  providers: [DynamicTaskQueueService],
  exports: [DynamicTaskQueueService],
})
export class TaskQueueModule {}
