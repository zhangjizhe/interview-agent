import { Roles } from '../auth/roles.decorator';
import {
  Controller,
  Get,
  Header,
  Param,
  Post,
  Body,
  Query,
  Req,
} from '@nestjs/common';
import { AgentRuntimeService } from './agent-runtime.service';
import { SubRunService } from './sub-run.service';
import { RunAgentDto, SpawnSubRunDto } from './dto/agent.dto';

@Controller('agent-lab')
@Roles('ADMIN')
export class AgentRuntimeController {
  constructor(
    private readonly runtime: AgentRuntimeService,
    private readonly subRuns: SubRunService,
  ) {}

  @Post('agents/:agentId/run')
  runAgent(
    @Req() req: any,
    @Param('agentId') agentId: string,
    @Body() dto: RunAgentDto,
  ) {
    return this.runtime.runAgent(req.user.userId, agentId, dto);
  }

  @Get('runs')
  listRuns(@Req() req: any, @Query('agentId') agentId?: string) {
    return this.runtime.listRuns(req.user.userId, agentId);
  }

  @Get('runs/:runId')
  getRun(@Req() req: any, @Param('runId') runId: string) {
    return this.runtime.getRun(req.user.userId, runId);
  }

  @Get('runs/:runId/trace')
  getTrace(@Req() req: any, @Param('runId') runId: string) {
    return this.runtime.getTrace(req.user.userId, runId);
  }

  @Get('runs/:runId/trace.jsonl')
  @Header('Content-Type', 'application/x-ndjson; charset=utf-8')
  exportTrace(@Req() req: any, @Param('runId') runId: string) {
    return this.runtime.exportTrace(req.user.userId, runId);
  }

  @Get('runs/:runId/trace.bundle')
  exportTraceBundle(@Req() req: any, @Param('runId') runId: string) {
    return this.runtime.exportTraceBundle(req.user.userId, runId);
  }

  @Post('runs/:runId/sub-runs')
  spawnSubRun(
    @Req() req: any,
    @Param('runId') runId: string,
    @Body() dto: SpawnSubRunDto,
  ) {
    return this.subRuns.spawn(req.user.userId, runId, dto);
  }

  @Get('runs/:runId/sub-runs')
  listSubRuns(@Req() req: any, @Param('runId') runId: string) {
    return this.subRuns.list(req.user.userId, runId);
  }

  @Post('runs/:runId/sub-runs/:childRunId/cancel')
  cancelSubRun(
    @Req() req: any,
    @Param('runId') runId: string,
    @Param('childRunId') childRunId: string,
  ) {
    return this.subRuns.cancel(req.user.userId, runId, childRunId);
  }
}
