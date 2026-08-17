jest.mock('../../infra/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('./agent-registry.service', () => ({
  AgentRegistryService: class AgentRegistryService {},
}));

import { ApplicationService } from './application.service';

describe('ApplicationService', () => {
  it('幂等注册 Interview Application，并绑定 Registry 中的 Agent', async () => {
    const prisma: any = {
      workspace: { upsert: jest.fn().mockResolvedValue({ id: 'workspace-1' }) },
      application: { upsert: jest.fn().mockResolvedValue({ id: 'application-1', agentId: 'agent-1' }) },
    };
    const registry = {
      bootstrapInterviewAgent: jest.fn().mockResolvedValue({ id: 'agent-1' }),
    };
    const service = new ApplicationService(prisma, registry as any);

    await service.bootstrapInterviewApplication('user-a');

    expect(prisma.application.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId_key: { workspaceId: 'workspace-1', key: 'interview' } },
        create: expect.objectContaining({ agentId: 'agent-1', type: 'interview' }),
      }),
    );
  });
});
