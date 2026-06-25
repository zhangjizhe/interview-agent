import { Module, OnApplicationBootstrap, Injectable } from '@nestjs/common';
import { QwenProvider } from './providers/qwen.provider';
import { DeepseekProvider } from './providers/deepseek.provider';
import { LlmGatewayService } from './llm.gateway.service';
import { PromptCacheInterceptor } from './cache/prompt-cache.interceptor';
import { SemanticCacheService } from './cache/semantic-cache.service';
import { SessionCostTracker } from './cost/session-cost.tracker';
import { SessionCostController } from './cost/session-cost.controller';
import { QdrantModule } from '../../infra/qdrant/qdrant.module';

/** LLM provider health check bootstrap */
@Injectable()
class LlmHealthBootstrap implements OnApplicationBootstrap {
  constructor(private gateway: LlmGatewayService) {}
  async onApplicationBootstrap() {
    // 异步不阻塞启动
    setImmediate(() => this.gateway.healthCheckProviders().catch(() => {}));
  }
}

@Module({
  imports: [QdrantModule],
  providers: [
    QwenProvider,
    DeepseekProvider,
    LlmGatewayService,
    PromptCacheInterceptor,
    SemanticCacheService,
    SessionCostTracker,
    LlmHealthBootstrap,
  ],
  controllers: [SessionCostController],
  exports: [
    LlmGatewayService,
    QwenProvider,
    DeepseekProvider,
    PromptCacheInterceptor,
    SemanticCacheService,
    SessionCostTracker,
  ],
})
export class LlmModule {}
