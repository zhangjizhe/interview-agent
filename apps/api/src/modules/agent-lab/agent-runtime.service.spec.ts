import { ConflictException, NotFoundException } from '@nestjs/common';
import { AgentRuntimeService } from './agent-runtime.service';

jest.mock('../../infra/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../agent/multi-agent.service', () => ({
  MultiAgentService: class MultiAgentService {},
}));

function createPrismaMock() {
  return {
    workspace: {
      upsert: jest.fn().mockResolvedValue({ id: 'workspace-1' }),
    },
    agent: {
      findFirst: jest.fn(),
    },
    agentVersion: {
      findFirst: jest.fn(),
    },
    run: {
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    traceEvent: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  };
}

const publishedInterviewVersion = {
  id: 'version-1',
  version: '1.0.0',
  status: 'PUBLISHED',
  runtimeConfig: { adapter: 'interview-multi-agent' },
};

describe('AgentRuntimeService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('执行已发布版本，并写入开始与完成 Trace', async () => {
    const prisma: any = createPrismaMock();
    prisma.agent.findFirst.mockResolvedValue({
      id: 'agent-1',
      currentVersion: publishedInterviewVersion,
    });
    prisma.run.create.mockResolvedValue({ id: 'run-1' });
    prisma.run.update.mockResolvedValue({ id: 'run-1', status: 'COMPLETED' });
    const multiAgent = {
      isEnabled: jest.fn().mockReturnValue(true),
      run: jest.fn().mockResolvedValue({
        response: '面试回答',
        intent: 'mock_interview',
        plan: [],
        pastSteps: [],
        steps: 0,
        threadId: 'run-1',
      }),
    };
    const service = new AgentRuntimeService(prisma, multiAgent as any);

    const result = await service.runAgent('user-a', 'agent-1', {
      input: { message: '请开始面试' },
    });

    expect(result).toMatchObject({ id: 'run-1', status: 'COMPLETED' });
    expect(multiAgent.run).toHaveBeenCalledWith('请开始面试', 'run-1');
    expect(prisma.traceEvent.create).toHaveBeenCalledTimes(2);
    expect(prisma.run.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'run-1' },
        data: expect.objectContaining({ status: 'COMPLETED' }),
      }),
    );
  });

  it('运行时未启用时将 Run 标记失败并写入失败 Trace', async () => {
    const prisma: any = createPrismaMock();
    prisma.agent.findFirst.mockResolvedValue({
      id: 'agent-1',
      currentVersion: publishedInterviewVersion,
    });
    prisma.run.create.mockResolvedValue({ id: 'run-1' });
    prisma.run.update.mockResolvedValue({ id: 'run-1', status: 'FAILED' });
    const multiAgent = {
      isEnabled: jest.fn().mockReturnValue(false),
      run: jest.fn(),
    };
    const service = new AgentRuntimeService(prisma, multiAgent as any);

    await expect(
      service.runAgent('user-a', 'agent-1', { input: { message: '请开始面试' } }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.run.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
    expect(prisma.traceEvent.create).toHaveBeenCalledTimes(2);
  });

  it('拒绝访问不属于当前 Workspace 的 Agent', async () => {
    const prisma: any = createPrismaMock();
    prisma.agent.findFirst.mockResolvedValue(null);
    const multiAgent = {
      isEnabled: jest.fn(),
      run: jest.fn(),
    };
    const service = new AgentRuntimeService(prisma, multiAgent as any);

    await expect(
      service.runAgent('user-a', 'foreign-agent', { input: { message: '请开始面试' } }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.run.create).not.toHaveBeenCalled();
  });
});
