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
import { TraceBundleService } from './trace-bundle.service';
import { PluginRegistryService } from './plugin-registry.service';
import { SubRunService } from './sub-run.service';
import { RunBudgetService } from './run-budget.service';
import { ApplicationController } from './application.controller';
import { ApplicationService } from './application.service';
import { InterviewLabBridgeService } from './interview-lab-bridge.service';

@Module({
  imports: [PrismaModule, AgentModule],
  controllers: [AgentRegistryController, AgentRuntimeController, EvaluationController, ApplicationController],
  providers: [
    AgentRegistryService,
    AgentRuntimeService,
    EvaluationService,
    TraceEventService,
    ToolApprovalService,
    ToolRunner,
    TraceBundleService,
    PluginRegistryService,
    SubRunService,
    RunBudgetService,
    ApplicationService,
    InterviewLabBridgeService,
  ],
  exports: [
    AgentRegistryService,
    AgentRuntimeService,
    EvaluationService,
    TraceEventService,
    ToolApprovalService,
    ToolRunner,
    TraceBundleService,
    PluginRegistryService,
    SubRunService,
    RunBudgetService,
    ApplicationService,
    InterviewLabBridgeService,
  ],
})
export class AgentLabModule {}
