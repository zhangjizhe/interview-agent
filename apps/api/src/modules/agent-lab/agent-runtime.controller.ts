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
import { RunAgentDto } from './dto/agent.dto';

@Controller('agent-lab')
export class AgentRuntimeController {
  constructor(private readonly runtime: AgentRuntimeService) {}

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
}
