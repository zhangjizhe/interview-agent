import { Module } from '@nestjs/common';
import { AgentLabModule } from '../agent-lab/agent-lab.module';
import { PortfolioAssistantController } from './portfolio-assistant.controller';
import { PortfolioAssistantService } from './portfolio-assistant.service';
@Module({ imports: [AgentLabModule], controllers: [PortfolioAssistantController], providers: [PortfolioAssistantService] })
export class PortfolioAssistantModule {}
