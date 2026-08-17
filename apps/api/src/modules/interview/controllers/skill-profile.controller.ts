import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { requireOwnedInterview } from '../../../common/ownership.util';
import { JobReadinessService, type UpsertTargetJobInput } from '../services/job-readiness.service';
import { TrainingService } from '../services/training.service';

@Controller('interview')
export class SkillProfileController {
  constructor(
    private prisma: PrismaService,
    private jobReadiness: JobReadinessService,
    private training: TrainingService,
  ) {}

  @Post('target-jobs')
  async createTargetJob(@Body() input: UpsertTargetJobInput, @Req() req: any) {
    return this.jobReadiness.createTargetJob(req.user.userId, input);
  }

  @Patch('target-jobs/:targetJobId')
  async updateTargetJob(
    @Param('targetJobId') targetJobId: string,
    @Body() input: Partial<UpsertTargetJobInput>,
    @Req() req: any,
  ) {
    return this.jobReadiness.updateTargetJob(req.user.userId, targetJobId, input);
  }

  @Post('target-jobs/:targetJobId/activate')
  async activateTargetJob(@Param('targetJobId') targetJobId: string, @Req() req: any) {
    return this.jobReadiness.activateTargetJob(req.user.userId, targetJobId);
  }

  @Get('target-jobs')
  async listTargetJobs(@Req() req: any) {
    return this.prisma.targetJob.findMany({
      where: { userId: req.user.userId },
      orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  @Get('target-jobs/:targetJobId/readiness')
  async getReadiness(@Param('targetJobId') targetJobId: string, @Req() req: any) {
    return this.jobReadiness.getReadiness(req.user.userId, targetJobId);
  }

  @Get('skills')
  async listSkillStates(@Req() req: any) {
    return this.prisma.candidateSkillState.findMany({
      where: { userId: req.user.userId },
      include: {
        skill: { select: { slug: true, name: true, taxonomyVersion: true } },
        targetJob: { select: { title: true, level: true, isActive: true } },
      },
      orderBy: { lastAssessedAt: 'desc' },
    });
  }

  @Post('target-jobs/:targetJobId/training-recommendations/refresh')
  async refreshTrainingRecommendations(@Param('targetJobId') targetJobId: string, @Req() req: any) {
    return this.training.refresh(req.user.userId, targetJobId);
  }

  @Get('training-recommendations')
  async listTrainingRecommendations(@Query('targetJobId') targetJobId: string | undefined, @Req() req: any) {
    return this.training.list(req.user.userId, targetJobId);
  }

  @Post('training-recommendations/:recommendationId/complete')
  async completeTrainingRecommendation(@Param('recommendationId') recommendationId: string, @Req() req: any) {
    return this.training.complete(req.user.userId, recommendationId);
  }

  @Get(':interviewId/evaluation-runs')
  async listEvaluationRuns(@Param('interviewId') interviewId: string, @Req() req: any) {
    await requireOwnedInterview(this.prisma, interviewId, req.user.userId);
    return this.prisma.evaluationRun.findMany({
      where: { interviewId },
      include: {
        definition: {
          select: {
            version: true,
            evaluatorVersion: true,
            promptVersion: true,
            rubricVersion: true,
            modelProvider: true,
            modelVersion: true,
            evaluationMode: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Get(':interviewId/evidence')
  async listAssessmentEvidence(@Param('interviewId') interviewId: string, @Req() req: any) {
    await requireOwnedInterview(this.prisma, interviewId, req.user.userId);
    return this.prisma.assessmentEvidence.findMany({
      where: { interviewId },
      include: {
        question: { select: { question: true, category: true, difficulty: true } },
        answer: { select: { content: true, createdAt: true } },
        skill: { select: { slug: true, name: true, taxonomyVersion: true } },
        evaluationRun: {
          select: { id: true, status: true, mode: true, createdAt: true, completedAt: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}
