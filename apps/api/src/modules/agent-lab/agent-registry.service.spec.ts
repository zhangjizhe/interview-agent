import { ConflictException, NotFoundException } from '@nestjs/common';
import { AgentRegistryService } from './agent-registry.service';
import { buildStratifiedEvaluationEvidence } from '../inference/evaluation-statistics';

function releaseMetrics(score = 100) {
  return {
    repeatCount: 3,
    latency: { p95Ms: 100 },
    tokenUsage: { status: 'available', totalTokens: 30 },
    estimatedCost: { status: 'available', totalCny: 0.01 },
    stratification: buildStratifiedEvaluationEvidence(Array.from({ length: 10 }, (_, index) => ({
      caseKey: `case-${index + 1}`,
      score,
      passed: score >= 90,
      metadata: { segments: {
        jobFamily: 'ai-agent-engineer',
        skill: index < 5 ? 'rag' : 'agent-evaluation',
        difficulty: index % 2 === 0 ? 'foundation' : 'advanced',
      } },
    }))),
  };
}

function createDecisionLedgerMock() {
  return {
    record: jest.fn().mockResolvedValue({ id: 'decision-1' }),
  };
}

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
    agentEvaluationRun: {
      findFirst: jest.fn(),
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
    const service = new AgentRegistryService(prisma, createDecisionLedgerMock() as any);

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
    const service = new AgentRegistryService(prisma, createDecisionLedgerMock() as any);

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
    prisma.agentEvaluationRun.findFirst.mockResolvedValue({
      id: 'evaluation-1',
      status: 'COMPLETED',
      score: 100,
      totalCases: 10,
      passedCases: 10,
      failedCases: 0,
      completedAt: new Date(),
      dataset: { frozenAt: new Date(), contentHash: 'sha256:dataset' },
      metrics: releaseMetrics(),
    });
    prisma.agentVersion.update.mockResolvedValue({
      id: 'version-2',
      status: 'PUBLISHED',
    });
    prisma.agent.update.mockResolvedValue({
      id: 'agent-1',
      currentVersionId: 'version-2',
    });
    const ledger = createDecisionLedgerMock();
    const service = new AgentRegistryService(prisma, ledger as any);

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
    expect(ledger.record).toHaveBeenCalledWith(
      expect.objectContaining({
        decisionType: 'agent-version.release-gate',
        subjectId: 'version-2',
      }),
    );
  });

  it('没有通过评测的草稿版本不能发布', async () => {
    const prisma = createPrismaMock();
    prisma.agentVersion.findFirst.mockResolvedValue({
      id: 'version-draft',
      status: 'DRAFT',
      publishedAt: null,
    });
    prisma.agentEvaluationRun.findFirst.mockResolvedValue(null);
    const ledger = createDecisionLedgerMock();
    const service = new AgentRegistryService(prisma, ledger as any);

    await expect(
      service.publishVersion('user-a', 'agent-1', 'version-draft'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.agentVersion.update).not.toHaveBeenCalled();
    expect(ledger.record).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: expect.objectContaining({ allowed: false }),
      }),
    );
  });

  it('发布审计无法写入时，即使评测通过也不能发布', async () => {
    const prisma = createPrismaMock();
    prisma.agentVersion.findFirst.mockResolvedValue({
      id: 'version-2',
      status: 'DRAFT',
      publishedAt: null,
    });
    prisma.agentEvaluationRun.findFirst.mockResolvedValue({
      id: 'evaluation-1',
      status: 'COMPLETED',
      score: 100,
      totalCases: 10,
      passedCases: 10,
      failedCases: 0,
      completedAt: new Date(),
      dataset: { frozenAt: new Date(), contentHash: 'sha256:dataset' },
      metrics: releaseMetrics(),
    });
    const ledger = createDecisionLedgerMock();
    ledger.record.mockRejectedValue(new Error('ledger unavailable'));
    const service = new AgentRegistryService(prisma, ledger as any);

    await expect(
      service.publishVersion('user-a', 'agent-1', 'version-2'),
    ).rejects.toThrow('ledger unavailable');
    expect(prisma.agentVersion.update).not.toHaveBeenCalled();
    expect(prisma.agent.update).not.toHaveBeenCalled();
  });

  it('候选版本低于同集当前版本基线时不能发布', async () => {
    const prisma = createPrismaMock();
    prisma.agentVersion.findFirst.mockResolvedValue({
      id: 'version-2',
      agentId: 'agent-1',
      status: 'DRAFT',
      publishedAt: null,
    });
    prisma.agent.findFirst.mockResolvedValue({ currentVersionId: 'version-1' });
    prisma.agentEvaluationRun.findFirst
      .mockResolvedValueOnce({
        id: 'evaluation-candidate',
        status: 'COMPLETED',
        score: 94,
        totalCases: 10,
        passedCases: 10,
        failedCases: 0,
        completedAt: new Date(),
        datasetId: 'dataset-1',
        evaluatorId: 'evaluator-1',
        dataset: { frozenAt: new Date(), contentHash: 'sha256:dataset' },
        metrics: releaseMetrics(94),
      })
      .mockResolvedValueOnce({
        id: 'evaluation-baseline',
        status: 'COMPLETED',
        score: 96,
        totalCases: 10,
        passedCases: 10,
        failedCases: 0,
        completedAt: new Date(),
        dataset: { frozenAt: new Date(), contentHash: 'sha256:dataset' },
        metrics: releaseMetrics(96),
      });
    const service = new AgentRegistryService(prisma, createDecisionLedgerMock() as any);

    await expect(
      service.publishVersion('user-a', 'agent-1', 'version-2'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.agentVersion.update).not.toHaveBeenCalled();
  });

  it('不允许将未发布版本回滚为当前版本', async () => {
    const prisma = createPrismaMock();
    prisma.agentVersion.findFirst.mockResolvedValue({
      id: 'version-draft',
      status: 'DRAFT',
    });
    const service = new AgentRegistryService(prisma, createDecisionLedgerMock() as any);

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
    const service = new AgentRegistryService(prisma, createDecisionLedgerMock() as any);

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
