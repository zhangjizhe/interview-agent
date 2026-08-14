import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { AgentModule } from '../agent/agent.module';
import { AgentRegistryController } from './agent-registry.controller';
import { AgentRegistryService } from './agent-registry.service';
import { AgentRuntimeController } from './agent-runtime.controller';
import { AgentRuntimeService } from './agent-runtime.service';

@Module({
  imports: [PrismaModule, AgentModule],
  controllers: [AgentRegistryController, AgentRuntimeController],
  providers: [AgentRegistryService, AgentRuntimeService],
  exports: [AgentRegistryService, AgentRuntimeService],
})
export class AgentLabModule {}
