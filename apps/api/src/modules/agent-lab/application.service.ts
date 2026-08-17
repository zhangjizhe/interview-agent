import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AgentRegistryService } from './agent-registry.service';

@Injectable()
export class ApplicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: AgentRegistryService,
  ) {}

  async bootstrapInterviewApplication(userId: string) {
    const workspace = await this.getOrCreateDefaultWorkspace(userId);
    const agent = await this.registry.bootstrapInterviewAgent(userId);
    return this.prisma.application.upsert({
      where: {
        workspaceId_key: {
          workspaceId: workspace.id,
          key: 'interview',
        },
      },
      create: {
        workspaceId: workspace.id,
        agentId: agent.id,
        key: 'interview',
        name: 'Interview',
        type: 'interview',
        config: {
          adapter: 'legacy-sse-bridge',
          sessionKey: 'interviewId',
        },
      },
      update: {
        agentId: agent.id,
        status: 'ACTIVE',
      },
      include: {
        agent: {
          select: {
            id: true,
            key: true,
            name: true,
            currentVersion: { select: { id: true, version: true, status: true } },
          },
        },
      },
    });
  }

  async listApplications(userId: string) {
    const workspace = await this.getOrCreateDefaultWorkspace(userId);
    return this.prisma.application.findMany({
      where: { workspaceId: workspace.id },
      include: {
        agent: {
          select: {
            id: true,
            key: true,
            name: true,
            currentVersion: { select: { id: true, version: true, status: true } },
          },
        },
        _count: { select: { runs: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getApplication(userId: string, applicationId: string) {
    const workspace = await this.getOrCreateDefaultWorkspace(userId);
    const application = await this.prisma.application.findFirst({
      where: { id: applicationId, workspaceId: workspace.id },
      include: {
        agent: {
          include: { currentVersion: true },
        },
      },
    });
    if (!application) throw new NotFoundException('Application 不存在或无权访问');
    return application;
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
