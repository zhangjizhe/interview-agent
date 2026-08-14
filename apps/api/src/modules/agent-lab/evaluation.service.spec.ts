import { NotFoundException } from '@nestjs/common';

jest.mock('../../infra/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('./agent-runtime.service', () => ({
  AgentRuntimeService: class AgentRuntimeService {},
}));

import { EvaluationService } from './evaluation.service';

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
    evaluationDataset: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    evaluationCase: {
      create: jest.fn(),
    },
    evaluator: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    evaluationRun: {
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    evaluationResult: {
      create: jest.fn(),
    },
  };
}

const publishedVersion = {
  id: 'version-1',
  version: '1.0.0',
  status: 'PUBLISHED',
};

function prepareEvaluation(prisma: any, evaluator: any, cases: any[]) {
  prisma.agent.findFirst.mockResolvedValue({
    id: 'agent-1',
    currentVersion: publishedVersion,
  });
  prisma.evaluationDataset.findFirst.mockResolvedValue({
    id: 'dataset-1',
    cases,
  });
  prisma.evaluator.findFirst.mockResolvedValue(evaluator);
  prisma.evaluationRun.create.mockResolvedValue({ id: 'evaluation-1' });
  prisma.evaluationRun.update.mockResolvedValue({ id: 'evaluation-1', status: 'COMPLETED' });
}

describe('EvaluationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('执行已发布版本并持久化通过的关键词断言', async () => {
    const prisma: any = createPrismaMock();
    prepareEvaluation(
      prisma,
      { id: 'evaluator-1', type: 'KEYWORD', config: { minScore: 100 } },
      [{
        id: 'case-1',
        input: { message: '请介绍 NestJS' },
        expectedOutput: { keywords: ['NestJS', '模块'] },
      }],
    );
    const runtime = {
      runAgent: jest.fn().mockResolvedValue({
        id: 'run-1',
        latencyMs: 24,
        output: { response: 'NestJS 使用模块组织应用。' },
      }),
    };
    const service = new EvaluationService(prisma, runtime as any);

    await service.runEvaluation('user-a', 'agent-1', {
      datasetId: 'dataset-1',
      evaluatorId: 'evaluator-1',
    });

    expect(runtime.runAgent).toHaveBeenCalledWith(
      'user-a',
      'agent-1',
      expect.objectContaining({
        agentVersionId: 'version-1',
        application: 'agent-lab-evaluation',
      }),
    );
    expect(prisma.evaluationResult.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          evaluationRunId: 'evaluation-1',
          runId: 'run-1',
          status: 'COMPLETED',
          passed: true,
          score: 100,
        }),
      }),
    );
    expect(prisma.evaluationRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'COMPLETED',
          passedCases: 1,
          failedCases: 0,
          score: 100,
        }),
      }),
    );
  });

  it('保存 JSON_SCHEMA 规则失败的断言证据', async () => {
    const prisma: any = createPrismaMock();
    prepareEvaluation(
      prisma,
      { id: 'evaluator-1', type: 'JSON_SCHEMA', config: {} },
      [{
        id: 'case-1',
        input: { message: '开始' },
        expectedOutput: { requiredKeys: ['response', 'citations'] },
      }],
    );
    const runtime = {
      runAgent: jest.fn().mockResolvedValue({
        id: 'run-1',
        latencyMs: 24,
        output: { response: '回答' },
      }),
    };
    const service = new EvaluationService(prisma, runtime as any);

    await service.runEvaluation('user-a', 'agent-1', {
      datasetId: 'dataset-1',
      evaluatorId: 'evaluator-1',
    });

    expect(prisma.evaluationResult.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'COMPLETED',
          passed: false,
          failureCategory: 'JSON_SCHEMA_MISMATCH',
          failureMessage: '输出缺少字段：citations',
        }),
      }),
    );
  });

  it('运行异常后仍保存失败结果并继续完成评测汇总', async () => {
    const prisma: any = createPrismaMock();
    prepareEvaluation(
      prisma,
      { id: 'evaluator-1', type: 'LATENCY', config: { maxLatencyMs: 100 } },
      [{ id: 'case-1', input: { message: '开始' }, expectedOutput: {} }],
    );
    const runtime = {
      runAgent: jest.fn().mockRejectedValue(new Error('运行时不可用')),
    };
    const service = new EvaluationService(prisma, runtime as any);

    await service.runEvaluation('user-a', 'agent-1', {
      datasetId: 'dataset-1',
      evaluatorId: 'evaluator-1',
    });

    expect(prisma.evaluationResult.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          passed: false,
          failureCategory: 'RUN_FAILED',
          failureMessage: '运行时不可用',
        }),
      }),
    );
    expect(prisma.evaluationRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'COMPLETED',
          passedCases: 0,
          failedCases: 1,
        }),
      }),
    );
  });

  it('拒绝使用不属于当前 Workspace 的 Dataset', async () => {
    const prisma: any = createPrismaMock();
    prisma.agent.findFirst.mockResolvedValue({
      id: 'agent-1',
      currentVersion: publishedVersion,
    });
    prisma.evaluationDataset.findFirst.mockResolvedValue(null);
    const runtime = { runAgent: jest.fn() };
    const service = new EvaluationService(prisma, runtime as any);

    await expect(
      service.runEvaluation('user-a', 'agent-1', {
        datasetId: 'foreign-dataset',
        evaluatorId: 'evaluator-1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(runtime.runAgent).not.toHaveBeenCalled();
    expect(prisma.evaluationRun.create).not.toHaveBeenCalled();
  });
});
