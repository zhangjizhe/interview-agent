import { Module } from '@nestjs/common';
import { InterviewController } from './interview.controller';
import { ToolsController } from './tools.controller';
import { AdminMcpController } from './admin-mcp.controller';
import { AgentModule } from '../agent/agent.module';
import { MemoryModule } from '../memory/memory.module';
import { LlmModule } from '../llm/llm.module';
import { ResumeParserService } from './services/resume-parser.service';
import { ResumeRAGService } from './services/resume-rag.service';
import { QuestionBankService } from './services/question-bank.service';

@Module({
  imports: [AgentModule, MemoryModule, LlmModule],
  controllers: [InterviewController, ToolsController, AdminMcpController],
  providers: [ResumeParserService, ResumeRAGService, QuestionBankService],
  exports: [ResumeParserService, ResumeRAGService, QuestionBankService],
})
export class InterviewModule {}