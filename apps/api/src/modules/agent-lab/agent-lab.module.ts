import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { AgentModule } from '../agent/agent.module';
import { AgentRegistryController } from './agent-registry.controller';
import { AgentRegistryService } from './agent-registry.service';
import { AgentRuntimeController } from './agent-runtime.controller';
import { AgentRuntimeService } from './agent-runtime.service';
import { EvaluationController } from './evaluation.controller';
import { EvaluationService } from './evaluation.service';
import { TraceEventService } from './trace-event.service';
import { ToolApprovalService } from './tool-approval.service';
import { ToolRunner } from './tool-runner.service';

@Module({
  imports: [PrismaModule, AgentModule],
  controllers: [AgentRegistryController, AgentRuntimeController, EvaluationController],
  providers: [
    AgentRegistryService,
    AgentRuntimeService,
    EvaluationService,
    TraceEventService,
    ToolApprovalService,
    ToolRunner,
  ],
  exports: [
    AgentRegistryService,
    AgentRuntimeService,
    EvaluationService,
    TraceEventService,
    ToolApprovalService,
    ToolRunner,
  ],
})
export class AgentLabModule {}
