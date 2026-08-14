import { ConflictException, NotFoundException } from '@nestjs/common';
import { AgentRegistryService } from './agent-registry.service';

function createPrismaMock() {
  const prisma: any = {
    workspace: {
      upsert: jest.fn().mockResolvedValue({ id: 'workspace-1' }),
    },
    agent: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    agentVersion: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
  };
  prisma.$transaction = jest.fn(async (callback: (tx: any) => unknown) => callback(prisma));
  return prisma;
}

describe('AgentRegistryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('只列出当前用户默认工作区中的 Agent', async () => {
    const prisma = createPrismaMock();
    prisma.agent.findMany.mockResolvedValue([]);
    const service = new AgentRegistryService(prisma);

    await expect(service.listAgents('user-a')).resolves.toEqual([]);

    expect(prisma.workspace.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { slug: 'personal-user-a' },
      }),
    );
    expect(prisma.agent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: 'workspace-1' },
      }),
    );
  });

  it('创建版本前校验 Agent 归属当前工作区', async () => {
    const prisma = createPrismaMock();
    prisma.agent.findFirst.mockResolvedValue(null);
    const service = new AgentRegistryService(prisma);

    await expect(
      service.createVersion('user-a', 'foreign-agent', {
        version: '1.0.0',
        systemPrompt: 'test',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.agentVersion.create).not.toHaveBeenCalled();
  });

  it('发布版本时更新 Agent 的当前版本指针', async () => {
    const prisma = createPrismaMock();
    prisma.agentVersion.findFirst.mockResolvedValue({
      id: 'version-2',
      agentId: 'agent-1',
      status: 'DRAFT',
      publishedAt: null,
    });
    prisma.agentVersion.update.mockResolvedValue({
      id: 'version-2',
      status: 'PUBLISHED',
    });
    prisma.agent.update.mockResolvedValue({
      id: 'agent-1',
      currentVersionId: 'version-2',
    });
    const service = new AgentRegistryService(prisma);

    await service.publishVersion('user-a', 'agent-1', 'version-2');

    expect(prisma.agentVersion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'version-2' },
        data: expect.objectContaining({ status: 'PUBLISHED' }),
      }),
    );
    expect(prisma.agent.update).toHaveBeenCalledWith({
      where: { id: 'agent-1' },
      data: {
        status: 'ACTIVE',
        currentVersionId: 'version-2',
      },
    });
  });

  it('不允许将未发布版本回滚为当前版本', async () => {
    const prisma = createPrismaMock();
    prisma.agentVersion.findFirst.mockResolvedValue({
      id: 'version-draft',
      status: 'DRAFT',
    });
    const service = new AgentRegistryService(prisma);

    await expect(
      service.activateVersion('user-a', 'agent-1', 'version-draft'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.agent.update).not.toHaveBeenCalled();
  });

  it('幂等初始化已有的 Interview Agent，不覆盖当前版本', async () => {
    const prisma = createPrismaMock();
    prisma.agent.upsert.mockResolvedValue({
      id: 'agent-interview',
      currentVersionId: 'version-existing',
    });
    prisma.agentVersion.upsert.mockResolvedValue({
      id: 'version-existing',
      version: '1.0.0',
      status: 'PUBLISHED',
    });
    prisma.agent.findFirst.mockResolvedValue({
      id: 'agent-interview',
      key: 'interview-interviewer',
      currentVersionId: 'version-existing',
      currentVersion: { id: 'version-existing', version: '1.0.0' },
      versions: [{ id: 'version-existing', version: '1.0.0' }],
    });
    const service = new AgentRegistryService(prisma);

    const result = await service.bootstrapInterviewAgent('user-a');

    expect(result).toMatchObject({ id: 'agent-interview' });
    expect(prisma.agentVersion.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          agentId_version: {
            agentId: 'agent-interview',
            version: '1.0.0',
          },
        },
      }),
    );
    expect(prisma.agent.update).not.toHaveBeenCalled();
  });
});
