import { AgentLabController } from './agent-lab.controller';
import { AgentLabService } from './agent-lab.service';
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
import { InferenceModule } from '../inference/inference.module';
import { ControlledEvolutionController } from './controlled-evolution.controller';
import { ControlledEvolutionService } from './controlled-evolution.service';

@Module({
  imports: [PrismaModule, AgentModule, InferenceModule],
  controllers: [AgentLabController, AgentRegistryController, AgentRuntimeController, EvaluationController, ApplicationController, ControlledEvolutionController],
  providers: [
    AgentLabService,
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
    ControlledEvolutionService,
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
    ControlledEvolutionService,
  ],
})
export class AgentLabModule {}
