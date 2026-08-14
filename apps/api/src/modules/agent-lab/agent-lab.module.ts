import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { AgentRegistryController } from './agent-registry.controller';
import { AgentRegistryService } from './agent-registry.service';

@Module({
  imports: [PrismaModule],
  controllers: [AgentRegistryController],
  providers: [AgentRegistryService],
  exports: [AgentRegistryService],
})
export class AgentLabModule {}
