import { Module } from '@nestjs/common';
import { KnowledgeBaseService, KnowledgeBaseBootstrap } from './knowledge-base.service';
import { KnowledgeBaseController } from './knowledge-base.controller';
import { QdrantModule } from '../../infra/qdrant/qdrant.module';

@Module({
  imports: [QdrantModule],
  providers: [KnowledgeBaseService, KnowledgeBaseBootstrap],
  controllers: [KnowledgeBaseController],
  exports: [KnowledgeBaseService],
})
export class KnowledgeBaseModule {}
