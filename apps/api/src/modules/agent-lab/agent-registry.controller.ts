import { Roles } from '../auth/roles.decorator';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { AgentRegistryService } from './agent-registry.service';
import {
  CloneAgentDto,
  CreateAgentDto,
  CreateAgentVersionDto,
  UpdateAgentDto,
} from './dto/agent.dto';

@Controller('agent-lab')
@Roles('ADMIN')
export class AgentRegistryController {
  constructor(private readonly registry: AgentRegistryService) {}

  @Post('bootstrap/interview-agent')
  bootstrapInterviewAgent(@Req() req: any) {
    return this.registry.bootstrapInterviewAgent(req.user.userId);
  }

  @Get('agents')
  listAgents(@Req() req: any) {
    return this.registry.listAgents(req.user.userId);
  }

  @Post('agents')
  createAgent(@Req() req: any, @Body() dto: CreateAgentDto) {
    return this.registry.createAgent(req.user.userId, dto);
  }

  @Get('agents/:agentId')
  getAgent(@Req() req: any, @Param('agentId') agentId: string) {
    return this.registry.getAgent(req.user.userId, agentId);
  }

  @Patch('agents/:agentId')
  updateAgent(
    @Req() req: any,
    @Param('agentId') agentId: string,
    @Body() dto: UpdateAgentDto,
  ) {
    return this.registry.updateAgent(req.user.userId, agentId, dto);
  }

  @Delete('agents/:agentId')
  deleteAgent(@Req() req: any, @Param('agentId') agentId: string) {
    return this.registry.deleteAgent(req.user.userId, agentId);
  }

  @Post('agents/:agentId/clone')
  cloneAgent(
    @Req() req: any,
    @Param('agentId') agentId: string,
    @Body() dto: CloneAgentDto,
  ) {
    return this.registry.cloneAgent(req.user.userId, agentId, dto);
  }

  @Post('agents/:agentId/versions')
  createVersion(
    @Req() req: any,
    @Param('agentId') agentId: string,
    @Body() dto: CreateAgentVersionDto,
  ) {
    return this.registry.createVersion(req.user.userId, agentId, dto);
  }

  @Get('agents/:agentId/versions')
  listVersions(@Req() req: any, @Param('agentId') agentId: string) {
    return this.registry.listVersions(req.user.userId, agentId);
  }

  @Get('agents/:agentId/versions/:versionId/release-gate')
  getReleaseGate(
    @Req() req: any,
    @Param('agentId') agentId: string,
    @Param('versionId') versionId: string,
  ) {
    return this.registry.getReleaseGate(req.user.userId, agentId, versionId);
  }

  @Get('agents/:agentId/versions/:versionId/decision-snapshot')
  getVersionDecisionSnapshot(
    @Req() req: any,
    @Param('agentId') agentId: string,
    @Param('versionId') versionId: string,
    @Query('asOf') asOf?: string,
  ) {
    return this.registry.getVersionDecisionSnapshot(
      req.user.userId,
      agentId,
      versionId,
      asOf,
    );
  }

  @Post('agents/:agentId/versions/:versionId/publish')
  publishVersion(
    @Req() req: any,
    @Param('agentId') agentId: string,
    @Param('versionId') versionId: string,
  ) {
    return this.registry.publishVersion(req.user.userId, agentId, versionId);
  }

  @Post('agents/:agentId/versions/:versionId/activate')
  activateVersion(
    @Req() req: any,
    @Param('agentId') agentId: string,
    @Param('versionId') versionId: string,
  ) {
    return this.registry.activateVersion(req.user.userId, agentId, versionId);
  }
}
