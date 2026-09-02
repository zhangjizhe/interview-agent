import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { AgentLabController } from './agent-lab.controller';
import { AgentLabService } from './agent-lab.service';

@Module({
  imports: [PrismaModule],
  controllers: [AgentLabController],
  providers: [AgentLabService],
})
export class AgentLabModule {}
