import { Module } from '@nestjs/common';
import { ToolsController } from './tools.controller';
import { AdminMcpController } from './admin-mcp.controller';
import { HitlController } from './controllers/hitl.controller';
import { InterviewLifecycleController } from './controllers/interview-lifecycle.controller';
import { ResumeController } from './controllers/resume.controller';
import { QuestionBankController } from './controllers/question-bank.controller';
import { EvaluationController } from './controllers/evaluation.controller';
import { InterviewFlowController } from './controllers/interview-flow.controller';
import { AgentModule } from '../agent/agent.module';
import { TaskQueueModule } from '../agent/task-queue.module';
import { AuthModule } from '../auth/auth.module';
import { MemoryModule } from '../memory/memory.module';
import { LlmModule } from '../llm/llm.module';
import { ResumeParserService } from './services/resume-parser.service';
import { ResumeRAGService } from './services/resume-rag.service';
import { QuestionBankService } from './services/question-bank.service';
import { QuestionGeneratorService } from './services/question-generator.service';
import { ScoringService } from './services/scoring.service';
import { RagService } from './services/rag.service';
import { HitlService } from './services/hitl.service';
import { PrismaService } from '../../infra/prisma/prisma.service';

@Module({
  imports: [AgentModule, MemoryModule, LlmModule, TaskQueueModule, AuthModule],
  // 注册顺序保证：LifecycleController（含 list/stats 等静态路由）必须最先注册，
  // FlowController（含 :interviewId/message 等参数路由）最后注册。
  // NestJS 跨 controller 按注册顺序匹配路由，避免 /interview/list 被
  // /interview/:interviewId 抢先匹配。
  controllers: [
    InterviewLifecycleController,
    ResumeController,
    QuestionBankController,
    EvaluationController,
    InterviewFlowController,
    ToolsController,
    AdminMcpController,
    HitlController,
  ],
  providers: [
    ResumeParserService,
    ResumeRAGService,
    QuestionBankService,
    QuestionGeneratorService,
    ScoringService,
    RagService,
    HitlService,
    PrismaService,
  ],
  exports: [
    ResumeParserService,
    ResumeRAGService,
    QuestionBankService,
    QuestionGeneratorService,
    ScoringService,
    HitlService,
  ],
})
export class InterviewModule {}
