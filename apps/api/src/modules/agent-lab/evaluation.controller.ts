import { Roles } from '../auth/roles.decorator';
import { Body, Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import { EvaluationService } from './evaluation.service';
import { EvaluationJobsService } from './evaluation-jobs.service';
import {
  CreateEvaluationDatasetCaseDto,
  CreateEvaluationDatasetDto,
  CreateEvaluatorDto,
  StartEvaluationJobDto,
} from './dto/agent.dto';

@Controller('agent-lab')
@Roles('ADMIN')
export class EvaluationController {
  constructor(private readonly evaluations: EvaluationService, private readonly jobs: EvaluationJobsService) {}

  @Post('datasets')
  createDataset(@Req() req: any, @Body() dto: CreateEvaluationDatasetDto) {
    return this.evaluations.createDataset(req.user.userId, dto);
  }

  @Get('datasets')
  listDatasets(@Req() req: any) {
    return this.evaluations.listDatasets(req.user.userId);
  }

  @Post('datasets/bootstrap/interview-release-v1')
  bootstrapCuratedReleaseDataset(@Req() req: any) {
    return this.evaluations.bootstrapCuratedReleaseDataset(req.user.userId);
  }

  @Get('datasets/:datasetId')
  getDataset(@Req() req: any, @Param('datasetId') datasetId: string) {
    return this.evaluations.getDataset(req.user.userId, datasetId);
  }

  @Post('datasets/:datasetId/cases')
  addDatasetCase(
    @Req() req: any,
    @Param('datasetId') datasetId: string,
    @Body() dto: CreateEvaluationDatasetCaseDto,
  ) {
    return this.evaluations.addDatasetCase(req.user.userId, datasetId, dto);
  }

  @Post('datasets/:datasetId/freeze')
  freezeDataset(@Req() req: any, @Param('datasetId') datasetId: string) {
    return this.evaluations.freezeDataset(req.user.userId, datasetId);
  }

  @Post('datasets/:datasetId/review')
  approveDatasetReview(@Req() req: any, @Param('datasetId') datasetId: string) {
    return this.evaluations.approveDatasetReview(req.user.userId, datasetId);
  }

  @Post('evaluators')
  createEvaluator(@Req() req: any, @Body() dto: CreateEvaluatorDto) {
    return this.evaluations.createEvaluator(req.user.userId, dto);
  }

  @Get('evaluators')
  listEvaluators(@Req() req: any) {
    return this.evaluations.listEvaluators(req.user.userId);
  }

  @Post('agents/:agentId/evaluations')
  @HttpCode(202)
  runEvaluation(
    @Req() req: any,
    @Param('agentId') agentId: string,
    @Body() dto: StartEvaluationJobDto,
  ) {
    return this.jobs.enqueue(req.user.userId, agentId, dto);
  }

  @Get('agents/:agentId/evaluations')
  listEvaluations(@Req() req: any, @Param('agentId') agentId: string) {
    return this.evaluations.listEvaluations(req.user.userId, agentId);
  }

  @Get('evaluations/:evaluationId')
  getEvaluation(@Req() req: any, @Param('evaluationId') evaluationId: string) {
    return this.evaluations.getEvaluation(req.user.userId, evaluationId);
  }
  @Post('evaluations/:evaluationId/cancel')
  @HttpCode(200)
  cancelEvaluation(@Req() req: any, @Param('evaluationId') evaluationId: string) {
    return this.jobs.cancel(req.user.userId, evaluationId);
  }
}
