import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { QuestionBankService } from './services/question-bank.service';

/** Shared by the queue and HTTP surface; neither imports InterviewModule. */
@Module({
  imports: [LlmModule],
  providers: [QuestionBankService],
  exports: [QuestionBankService],
})
export class QuestionBankModule {}
