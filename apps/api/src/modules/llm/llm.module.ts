import { QuotaService } from './usage/quota.service';
import { Module } from '@nestjs/common';
import { QwenProvider } from './providers/qwen.provider';
import { DeepseekProvider } from './providers/deepseek.provider';
import { LlmGatewayService } from './llm.gateway.service';
import { PromptCacheInterceptor } from './cache/prompt-cache.interceptor';
import { SemanticCacheService } from './cache/semantic-cache.service';
import { SessionCostTracker } from './cost/session-cost.tracker';
import { SessionCostController } from './cost/session-cost.controller';
import { UsageService } from './usage/usage.service';
import { UsageController } from './usage/usage.controller';
import { QdrantModule } from '../../infra/qdrant/qdrant.module';
import { LlmPricingCatalogService } from './cost/llm-pricing-catalog.service';

@Module({
  imports: [QdrantModule],
  providers: [
    QwenProvider,
    DeepseekProvider,
    LlmGatewayService,
    PromptCacheInterceptor,
    SemanticCacheService,
    SessionCostTracker,
    LlmPricingCatalogService,
    UsageService,
    QuotaService,
  ],
  controllers: [SessionCostController, UsageController],
  exports: [
    LlmGatewayService,
    QwenProvider,
    DeepseekProvider,
    PromptCacheInterceptor,
    SemanticCacheService,
    SessionCostTracker,
    LlmPricingCatalogService,
    UsageService,
    QuotaService,
  ],
})
export class LlmModule {}
