import { ConflictException, NotFoundException } from '@nestjs/common';
import { AgentRuntimeService } from './agent-runtime.service';

jest.mock('../../infra/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../agent/multi-agent.service', () => ({
  MultiAgentService: class MultiAgentService {},
}));

jest.mock('./trace-event.service', () => ({
  TraceEventService: class TraceEventService {},
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
  };
}

function createTraceMock() {
  return {
    append: jest.fn().mockResolvedValue({ id: 'trace-1' }),
    list: jest.fn(),
    exportJsonl: jest.fn(),
  };
}

function createTraceBundleMock() {
  return {
    buildBundle: jest.fn(),
  };
}

const publishedInterviewVersion = {
  id: 'version-1',
  version: '1.0.0',
  status: 'PUBLISHED',
  runtimeConfig: { adapter: 'interview-multi-agent' },
  systemPrompt: '已批准策略',
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
    const trace = createTraceMock();
    const service = new AgentRuntimeService(
      prisma,
      multiAgent as any,
      trace as any,
      createTraceBundleMock() as any,
    );

    const result = await service.runAgent('user-a', 'agent-1', {
      input: { message: '请开始面试' },
    });

    expect(result).toMatchObject({ id: 'run-1', status: 'COMPLETED' });
    expect(multiAgent.run).toHaveBeenCalledWith(
      '请开始面试',
      'run-1',
      [],
      '已批准策略',
    );
    expect(trace.append).toHaveBeenCalledTimes(2);
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
    const trace = createTraceMock();
    const service = new AgentRuntimeService(
      prisma,
      multiAgent as any,
      trace as any,
      createTraceBundleMock() as any,
    );

    await expect(
      service.runAgent('user-a', 'agent-1', { input: { message: '请开始面试' } }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.run.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
    expect(trace.append).toHaveBeenCalledTimes(2);
  });

  it('拒绝访问不属于当前 Workspace 的 Agent', async () => {
    const prisma: any = createPrismaMock();
    prisma.agent.findFirst.mockResolvedValue(null);
    const multiAgent = {
      isEnabled: jest.fn(),
      run: jest.fn(),
    };
    const service = new AgentRuntimeService(
      prisma,
      multiAgent as any,
      createTraceMock() as any,
      createTraceBundleMock() as any,
    );

    await expect(
      service.runAgent('user-a', 'foreign-agent', { input: { message: '请开始面试' } }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.run.create).not.toHaveBeenCalled();
  });

  it('草稿版本只能通过显式的发布前评测选项运行', async () => {
    const prisma: any = createPrismaMock();
    prisma.agent.findFirst.mockResolvedValue({
      id: 'agent-1',
      currentVersion: publishedInterviewVersion,
    });
    prisma.agentVersion.findFirst.mockResolvedValue({
      ...publishedInterviewVersion,
      id: 'version-draft',
      version: '1.0.1',
      status: 'DRAFT',
      systemPrompt: '候选策略',
    });
    prisma.run.create.mockResolvedValue({ id: 'run-draft' });
    prisma.run.update.mockResolvedValue({ id: 'run-draft', status: 'COMPLETED' });
    const multiAgent = {
      isEnabled: jest.fn().mockReturnValue(true),
      run: jest.fn().mockResolvedValue({
        response: '候选回答',
        plan: [],
        pastSteps: [],
        threadId: 'evaluation-1',
      }),
    };
    const service = new AgentRuntimeService(
      prisma,
      multiAgent as any,
      createTraceMock() as any,
      createTraceBundleMock() as any,
    );
    const dto = {
      agentVersionId: 'version-draft',
      application: 'agent-lab-evaluation',
      input: { message: '评测候选' },
    };

    await expect(service.runAgent('user-a', 'agent-1', dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(
      service.runAgent('user-a', 'agent-1', dto, { allowDraftVersion: true }),
    ).resolves.toMatchObject({ id: 'run-draft', status: 'COMPLETED' });
    expect(multiAgent.run).toHaveBeenCalledWith(
      '评测候选',
      'run-draft',
      [],
      '候选策略',
    );
  });

  it('拒绝读取不属于当前 Workspace 的 Trace', async () => {
    const prisma: any = createPrismaMock();
    prisma.run.findFirst.mockResolvedValue(null);
    const trace = createTraceMock();
    const service = new AgentRuntimeService(
      prisma,
      { isEnabled: jest.fn(), run: jest.fn() } as any,
      trace as any,
      createTraceBundleMock() as any,
    );

    await expect(service.getTrace('user-a', 'foreign-run')).rejects.toBeInstanceOf(NotFoundException);
    expect(trace.list).not.toHaveBeenCalled();
  });
});
