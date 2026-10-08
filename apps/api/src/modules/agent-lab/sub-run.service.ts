import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { TraceEventService } from './trace-event.service';
import { SpawnSubRunDto } from './dto/agent.dto';

@Injectable()
export class SubRunService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trace: TraceEventService,
  ) {}

  async spawn(userId: string, parentRunId: string, dto: SpawnSubRunDto) {
    const workspace = await this.getOrCreateDefaultWorkspace(userId);
    const parent = await this.prisma.run.findFirst({
      where: { id: parentRunId, workspaceId: workspace.id },
    });
    if (!parent) throw new NotFoundException('父 Run 不存在或无权访问');
    if (parent.status !== 'RUNNING' && parent.status !== 'PENDING') {
      throw new ConflictException('仅可从运行中或待运行的父 Run 创建子任务');
    }
    const child = await this.prisma.run.create({
      data: {
        workspaceId: workspace.id,
        agentId: parent.agentId,
        agentVersionId: parent.agentVersionId,
        parentRunId: parent.id,
        application: 'agent-lab-sub-agent',
        input: dto.input as any,
        budget: dto.budget as any,
        status: 'PENDING',
      },
    });
    await this.trace.append(child.id, {
      type: 'run.created',
      name: 'Sub Run Created',
      payload: { parentRunId: parent.id, budget: dto.budget ?? null },
    });
    await this.trace.append(parent.id, {
      type: 'subagent.spawned',
      name: 'Sub Agent Spawned',
      payload: { childRunId: child.id, budget: dto.budget ?? null },
    });
    return child;
  }

  async cancel(userId: string, parentRunId: string, childRunId: string) {
    const workspace = await this.getOrCreateDefaultWorkspace(userId);
    const child = await this.prisma.run.findFirst({
      where: { id: childRunId, parentRunId, workspaceId: workspace.id },
    });
    if (!child) throw new NotFoundException('子 Run 不存在或无权访问');
    if (child.status === 'COMPLETED' || child.status === 'FAILED' || child.status === 'CANCELLED') {
      throw new ConflictException('终态子 Run 不能取消');
    }
    const cancelled = await this.prisma.run.update({
      where: { id: child.id },
      data: { status: 'CANCELLED', cancelRequestedAt: new Date(), completedAt: new Date() },
    });
    await this.trace.append(child.id, {
      type: 'run.cancelled',
      name: 'Sub Run Cancelled',
      payload: { parentRunId },
    });
    await this.trace.append(parentRunId, {
      type: 'subagent.result',
      name: 'Sub Agent Result Delivered',
      payload: { childRunId: child.id, status: 'CANCELLED' },
    });
    return cancelled;
  }

  async fail(userId: string, parentRunId: string, childRunId: string, error: string) {
    const workspace = await this.getOrCreateDefaultWorkspace(userId);
    const child = await this.prisma.run.findFirst({
      where: { id: childRunId, parentRunId, workspaceId: workspace.id },
    });
    if (!child) throw new NotFoundException('子 Run 不存在或无权访问');
    if (child.status === 'COMPLETED' || child.status === 'FAILED' || child.status === 'CANCELLED') {
      throw new ConflictException('终态子 Run 不能再次标记失败');
    }
    const failed = await this.prisma.run.update({
      where: { id: child.id },
      data: { status: 'FAILED', error, completedAt: new Date() },
    });
    await this.trace.append(child.id, {
      type: 'run.failed',
      name: 'Sub Run Failed',
      payload: { parentRunId, error },
      error,
    });
    await this.trace.append(parentRunId, {
      type: 'subagent.result',
      name: 'Sub Agent Result Delivered',
      payload: { childRunId: child.id, status: 'FAILED', error },
      error,
    });
    return failed;
  }

  async list(userId: string, parentRunId: string) {
    const workspace = await this.getOrCreateDefaultWorkspace(userId);
    const parent = await this.prisma.run.findFirst({
      where: { id: parentRunId, workspaceId: workspace.id },
      select: { id: true },
    });
    if (!parent) throw new NotFoundException('父 Run 不存在或无权访问');
    return this.prisma.run.findMany({
      where: { parentRunId, workspaceId: workspace.id },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async getOrCreateDefaultWorkspace(userId: string) {
    return this.prisma.workspace.upsert({
      where: { slug: `personal-${userId}` },
      create: {
        name: `${userId} 的工作区`,
        slug: `personal-${userId}`,
        ownerId: userId,
        members: { create: { userId, role: 'OWNER' } },
      },
      update: {},
    });
  }
}
