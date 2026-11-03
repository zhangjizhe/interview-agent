import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { QuestionVectorIndexService, QuestionCatalogIndexService } from './services/question-vector-index.service';
import { QuestionBankService } from './services/question-bank.service';

/** Shared by the queue and HTTP surface; neither imports InterviewModule. */
@Module({
  imports: [LlmModule],
  providers: [QuestionVectorIndexService, QuestionCatalogIndexService, QuestionBankService],
  exports: [QuestionBankService],
})
export class QuestionBankModule {}
