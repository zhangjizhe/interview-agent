import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { ControlledEvolutionService } from './controlled-evolution.service';
import { ComparisonScopeDto, GenerateImprovementCandidateDto } from './dto/controlled-evolution.dto';

@Controller('agent-lab/agents/:agentId/evolution')
@Roles('ADMIN')
export class ControlledEvolutionController {
  constructor(private readonly evolution: ControlledEvolutionService) {}

  @Post('candidates')
  generateCandidate(
    @Req() req: any,
    @Param('agentId') agentId: string,
    @Body() dto: GenerateImprovementCandidateDto,
  ) {
    return this.evolution.generateCandidate(req.user.userId, agentId, dto);
  }

  @Get('candidates/:candidateVersionId/comparison')
  compareCandidate(
    @Req() req: any,
    @Param('agentId') agentId: string,
    @Param('candidateVersionId') candidateVersionId: string,
    @Query() scope: ComparisonScopeDto,
  ) {
    return this.evolution.compareCandidate(req.user.userId, agentId, candidateVersionId, scope);
  }
}
