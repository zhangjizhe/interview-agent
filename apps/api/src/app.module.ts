import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { configuration } from './infra/config/configuration';
import { PrismaModule } from './infra/prisma/prisma.module';
import { RedisModule } from './infra/redis/redis.module';
import { LangfuseModule } from './infra/langfuse/langfuse.module';
import { QdrantModule } from './infra/qdrant/qdrant.module';
import { LlmModule } from './modules/llm/llm.module';
import { MemoryModule } from './modules/memory/memory.module';
import { AgentModule } from './modules/agent/agent.module';
import { InterviewModule } from './modules/interview/interview.module';
import { UserModule } from './modules/user/user.module';
import { KnowledgeBaseModule } from './modules/knowledge-base/knowledge-base.module';
import { MetricsModule } from './modules/metrics/metrics.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env.local', '.env'],
    }),
    PrismaModule,
    RedisModule,
    LangfuseModule,
    QdrantModule,
    LlmModule,
    MemoryModule,
    AgentModule,
    KnowledgeBaseModule,
    InterviewModule,
    UserModule,
    MetricsModule,
  ],
})
export class AppModule {}
