import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { AgentLabService } from './agent-lab.service';

@Controller('agent-lab')
@Roles('ADMIN')
export class AgentLabController {
  constructor(private readonly agentLab: AgentLabService) {}

  @Get('dashboard')
  dashboard() {
    return this.agentLab.dashboard();
  }

  @Get('audit')
  audit(@Query() query: any) {
    return this.agentLab.audit(query);
  }

  @Get('operation-logs')
  operationLogs(@Query() query: any) {
    return this.agentLab.operationLogs(query);
  }

  @Get('retention/preview')
  retentionPreview() {
    return this.agentLab.retentionPreview();
  }

  @Post('retention/execute')
  executeRetention(@Body() body: any, @Req() req: any) {
    return this.agentLab.executeRetention(body, req.user.userId);
  }

  @Post('runs/record')
  recordRun(@Body() body: any, @Req() req: any) {
    return this.agentLab.recordRun(body, req.user.userId);
  }

  @Get('recorded-imports')
  listRecordedImports() {
    return this.agentLab.listRecordedImports();
  }

  @Post('recorded-imports')
  submitRecordedImport(@Body() body: any, @Req() req: any) {
    return this.agentLab.submitRecordedImport(body, req.user.userId);
  }

  @Post('recorded-imports/:importId/execute')
  executeRecordedImport(@Param('importId') importId: string, @Req() req: any) {
    return this.agentLab.executeRecordedImport(importId, req.user.userId);
  }

  @Post('experiments')
  createExperiment(@Body() body: any, @Req() req: any) {
    return this.agentLab.createExperiment(body, req.user.userId);
  }

  @Post('release-decisions')
  recordManualDecision(@Body() body: any, @Req() req: any) {
    return this.agentLab.recordManualDecision(body, req.user.userId);
  }
}
