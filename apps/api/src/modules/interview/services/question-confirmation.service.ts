import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { DynamicTaskQueueService } from './dynamic-task-queue.service';
import { QuestionPresentationService } from './question-presentation.service';

/** Stored-row preparation only: no model, Lab run or mutable work in GET. */
@Injectable()
export class QuestionConfirmationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: DynamicTaskQueueService,
    private readonly presentation: QuestionPresentationService,
  ) {}

  async confirm(interviewId: string, userId: string) {
    const existing = await this.presentation.readCurrent(interviewId, userId);
    const interview = await this.prisma.interview.findFirst({
      where: { id: interviewId, userId }, include: { practiceSkill: { select: { name: true } } },
    });
    if (!interview) throw new NotFoundException('Interview not found');
    if (interview.status !== 'IN_PROGRESS') throw new ConflictException('Interview is not active');
    const hasTasks = existing ? 1 : await this.prisma.interviewTask.count({ where: { interviewId, organizationId: interview.organizationId } });
    // The bounded Milvus read runs outside the parent-row database transaction.
    // Concurrent confirmation may repeat that read but cannot repeat paid work.
    const prepared = hasTasks ? [] : await this.queue.prepareInitialTasks(interviewId, interview.position, interview.level, {
      mode: interview.mode,
      targetJobId: interview.targetJobId || undefined,
      targetJobProfileVersion: interview.targetJobProfileVersion || undefined,
      practiceSkillId: interview.practiceSkillId || undefined,
      practiceSkillName: interview.practiceSkill?.name,
    });
    const currentQuestion = await this.presentation.confirmPrepared(interviewId, userId, {
      position: interview.position, level: interview.level, mode: interview.mode,
      targetJobId: interview.targetJobId, targetJobProfileVersion: interview.targetJobProfileVersion,
      practiceSkillId: interview.practiceSkillId,
    }, prepared);
    return { success: true, questionProtocol: 'presentation/v1', currentQuestion };
  }
}
