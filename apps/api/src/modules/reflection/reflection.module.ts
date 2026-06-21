/**
 * Reflection 模块（ADR #10 Phase 1）
 *
 * 导出 ReflectionService 供 multi-agent.service 在 reviewer 节点执行后调用
 *
 * 注意：模块本身暂未在 app.module.ts 注册（避免 module-level 改动引入副作用），
 *      ReflectionService 是 transient / 可选注入，multi-agent.service 直接 new 也可
 */
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { ReflectionService } from './reflection.service';

@Module({
  imports: [PrismaModule],
  providers: [ReflectionService],
  exports: [ReflectionService],
})
export class ReflectionModule {}