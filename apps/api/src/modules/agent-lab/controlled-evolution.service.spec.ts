import { ConflictException, NotFoundException } from '@nestjs/common';

jest.mock('../../infra/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { ControlledEvolutionService } from './controlled-evolution.service';

function createPrismaMock() {
  return {
    workspace: {
      upsert: jest.fn().mockResolvedValue({ id: 'workspace-1' }),
    },
    agent: {
      findFirst: jest.fn(),
    },
    agentVersion: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    agentEvaluationRun: {
      findFirst: jest.fn(),
    },
  };
}

const currentVersion = {
  id: 'version-1',
  version: '1.0.0',
  status: 'PUBLISHED',
  systemPrompt: '基础策略',
  modelConfig: { model: 'qwen-plus' },
  runtimeConfig: { adapter: 'interview-multi-agent' },
  toolBindings: { available: ['knowledge_bank'] },
  knowledgeBindings: null,
  memoryBindings: null,
  inputSchema: null,
  outputSchema: null,
};

describe('ControlledEvolutionService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('从当前版本的失败评测生成受限草稿候选，不自动发布', async () => {
    const prisma: any = createPrismaMock();
    prisma.agent.findFirst.mockResolvedValue({
      id: 'agent-1',
      currentVersionId: currentVersion.id,
      currentVersion,
    });
    prisma.agentEvaluationRun.findFirst.mockResolvedValue({
      id: 'evaluation-1',
      status: 'COMPLETED',
      failedCases: 2,
      agentVersionId: currentVersion.id,
      results: [
        { passed: false, failureCategory: 'KEYWORD_MISMATCH' },
        { passed: false, failureCategory: 'RUN_FAILED' },
      ],
    });
    prisma.agentVersion.findMany.mockResolvedValue([{ version: '1.0.0' }]);
    prisma.agentVersion.create.mockResolvedValue({
      id: 'version-2',
      version: '1.0.1',
      status: 'DRAFT',
    });

    const service = new ControlledEvolutionService(prisma);
    const result = await service.generateCandidate('user-a', 'agent-1', {
      sourceEvaluationId: 'evaluation-1',
    });

    expect(prisma.agentVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        agentId: 'agent-1',
        version: '1.0.1',
        status: 'DRAFT',
        systemPrompt: expect.stringContaining('Agent Lab 受控改进策略'),
        runtimeConfig: currentVersion.runtimeConfig,
        changelog: expect.stringContaining('evaluation-1'),
      }),
    });
    expect(result).toMatchObject({
      sourceEvaluationId: 'evaluation-1',
      failureCategories: ['KEYWORD_MISMATCH', 'RUN_FAILED'],
      candidate: { id: 'version-2', status: 'DRAFT' },
      requiresHumanApproval: true,
    });
  });

  it('拒绝使用非当前版本或无失败用例的评测生成候选', async () => {
    const prisma: any = createPrismaMock();
    prisma.agent.findFirst.mockResolvedValue({
      id: 'agent-1',
      currentVersionId: currentVersion.id,
      currentVersion,
    });
    prisma.agentEvaluationRun.findFirst.mockResolvedValue({
      id: 'evaluation-old',
      status: 'COMPLETED',
      failedCases: 1,
      agentVersionId: 'version-old',
      results: [{ passed: false, failureCategory: 'KEYWORD_MISMATCH' }],
    });

    const service = new ControlledEvolutionService(prisma);
    await expect(
      service.generateCandidate('user-a', 'agent-1', {
        sourceEvaluationId: 'evaluation-old',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.agentVersion.create).not.toHaveBeenCalled();
  });

  it('只读取当前工作区内的评测证据', async () => {
    const prisma: any = createPrismaMock();
    prisma.agent.findFirst.mockResolvedValue(null);
    const service = new ControlledEvolutionService(prisma);

    await expect(
      service.generateCandidate('user-a', 'foreign-agent', {
        sourceEvaluationId: 'evaluation-1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('比较同一数据集与评测器上的当前版本和候选版本', async () => {
    const prisma: any = createPrismaMock();
    prisma.agent.findFirst.mockResolvedValue({
      id: 'agent-1',
      currentVersionId: currentVersion.id,
      currentVersion,
    });
    prisma.agentEvaluationRun.findFirst
      .mockResolvedValueOnce({
        id: 'candidate-eval',
        status: 'COMPLETED',
        completedAt: new Date(),
        agentVersionId: 'version-2',
        datasetId: 'dataset-1',
        evaluatorId: 'evaluator-1',
        score: 96,
        totalCases: 10,
        passedCases: 10,
        failedCases: 0,
        dataset: { frozenAt: new Date(), contentHash: 'sha256:dataset' },
        metrics: {
          repeatCount: 3,
          latency: { p95Ms: 1200 },
          tokenUsage: { status: 'available', totalTokens: 300 },
          estimatedCost: { status: 'available', totalCny: 0.01 },
        },
      })
      .mockResolvedValueOnce({
        id: 'baseline-eval',
        status: 'COMPLETED',
        completedAt: new Date(),
        agentVersionId: currentVersion.id,
        datasetId: 'dataset-1',
        evaluatorId: 'evaluator-1',
        score: 91,
        totalCases: 10,
        passedCases: 10,
        failedCases: 0,
        dataset: { frozenAt: new Date(), contentHash: 'sha256:dataset' },
        metrics: {
          repeatCount: 3,
          latency: { p95Ms: 1100 },
          tokenUsage: { status: 'available', totalTokens: 300 },
          estimatedCost: { status: 'available', totalCny: 0.01 },
        },
      });

    const service = new ControlledEvolutionService(prisma);
    await expect(
      service.compareCandidate('user-a', 'agent-1', 'version-2'),
    ).resolves.toMatchObject({
      comparable: true,
      scoreDelta: 5,
      releaseRecommendation: 'APPROVE',
      candidate: { evaluationId: 'candidate-eval', score: 96 },
      baseline: { evaluationId: 'baseline-eval', score: 91 },
    });
  });
});
