import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

jest.mock('../../infra/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('./agent-runtime.service', () => ({
  AgentRuntimeService: class AgentRuntimeService {},
}));

import { EvaluationService } from './evaluation.service';
import { CURATED_INTERVIEW_RELEASE_EVALUATOR } from './curated-release-dataset';

function createPrismaMock() {
  const prisma: any = {
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
      findFirstOrThrow: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    evaluationCase: {
      create: jest.fn(),
    },
    evaluator: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    agentEvaluationRun: {
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    evaluationResult: {
      create: jest.fn(),
    },
  };
  prisma.$transaction = jest.fn(async (callback: (tx: any) => unknown) => callback(prisma));
  return prisma;
}

const publishedVersion = {
  id: 'version-1',
  version: '1.0.0',
  status: 'PUBLISHED',
};

function releaseMetadata(index: number) {
  return {
    segments: {
      jobFamily: 'ai-agent-engineer',
      skill: index < 5 ? 'rag' : 'agent-evaluation',
      difficulty: index % 2 === 0 ? 'foundation' : 'advanced',
    },
    provenance: {
      sourceType: 'synthetic-product-scenario',
      owner: 'test-maintainer',
      allowedUse: 'agent-release-evaluation',
      containsCandidateData: false,
      containsPersonalData: false,
    },
  };
}

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
  prisma.agentEvaluationRun.create.mockResolvedValue({ id: 'evaluation-1' });
  prisma.agentEvaluationRun.update.mockResolvedValue({ id: 'evaluation-1', status: 'COMPLETED' });
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
      { allowDraftVersion: true, bypassSemanticCache: true },
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
    expect(prisma.agentEvaluationRun.update).toHaveBeenCalledWith(
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

  it('冻结 Dataset 时生成内容指纹，冻结后拒绝追加 Case', async () => {
    const prisma: any = createPrismaMock();
    prisma.evaluationDataset.findFirst
      .mockResolvedValueOnce({
        id: 'dataset-1',
        frozenAt: null,
        cases: [{
          key: 'case-1', input: { message: 'hello' }, expectedOutput: { keywords: ['hello'] },
          metadata: null, enabled: true,
        }],
      })
      .mockResolvedValueOnce({ id: 'dataset-1', frozenAt: new Date() });
    prisma.evaluationDataset.updateMany.mockResolvedValue({ count: 1 });
    const service = new EvaluationService(prisma, { runAgent: jest.fn() } as any);

    await service.freezeDataset('user-a', 'dataset-1');
    await expect(service.addDatasetCase('user-a', 'dataset-1', {
      key: 'case-2', input: { message: 'later' },
    })).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.evaluationDataset.updateMany).toHaveBeenCalledWith({
      where: { id: 'dataset-1', workspaceId: 'workspace-1', frozenAt: null },
      data: expect.objectContaining({
        frozenAt: expect.any(Date),
        contentHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      }),
    });
    expect(prisma.evaluationCase.create).not.toHaveBeenCalled();
  });

  it('幂等导入内置发布 Dataset 与 Evaluator，并保持人工审查待办', async () => {
    const prisma: any = createPrismaMock();
    prisma.evaluationDataset.findFirst.mockResolvedValue(null);
    prisma.evaluationDataset.create.mockResolvedValue({
      id: 'dataset-curated', version: '1.0.0', metadata: { review: { status: 'PENDING' } },
    });
    prisma.evaluationDataset.update.mockImplementation(async ({ data }: any) => ({
      id: 'dataset-curated',
      key: 'interview-release-v1',
      version: '1.0.0',
      metadata: { review: { status: 'PENDING' } },
      cases: [],
      ...data,
    }));
    prisma.evaluator.findFirst.mockResolvedValue(null);
    prisma.evaluator.create.mockResolvedValue({
      id: 'evaluator-curated',
      ...CURATED_INTERVIEW_RELEASE_EVALUATOR,
    });
    const service = new EvaluationService(prisma, { runAgent: jest.fn() } as any);

    const first = await service.bootstrapCuratedReleaseDataset('user-a');
    prisma.evaluationDataset.findFirst.mockResolvedValue(first.dataset);
    prisma.evaluator.findFirst.mockResolvedValue(first.evaluator);
    const second = await service.bootstrapCuratedReleaseDataset('user-a');

    expect(first).toMatchObject({
      reviewRequired: true,
      releaseRunPlan: { cases: 12, samplesPerVersion: 36, comparisonSamples: 72 },
    });
    expect(second.dataset.id).toBe('dataset-curated');
    expect(prisma.evaluationDataset.create).toHaveBeenCalledTimes(1);
    expect(prisma.evaluator.create).toHaveBeenCalledTimes(1);
    expect(prisma.evaluationDataset.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        key: 'interview-release-v1',
        cases: { create: expect.arrayContaining([expect.objectContaining({ key: 'rag-retrieval-foundation' })]) },
      }),
    }));
  });

  it('只允许批准已冻结且满足分层合同的 Dataset，并记录管理员身份', async () => {
    const prisma: any = createPrismaMock();
    const cases = Array.from({ length: 10 }, (_, index) => ({
      id: `case-${index + 1}`,
      key: `case-${index + 1}`,
      metadata: releaseMetadata(index),
    }));
    prisma.evaluationDataset.findFirst.mockResolvedValue({
      id: 'dataset-1',
      frozenAt: new Date(),
      contentHash: 'sha256:dataset',
      metadata: { review: { status: 'PENDING' } },
      cases,
    });
    prisma.evaluationDataset.update.mockImplementation(async ({ data }: any) => data);
    const service = new EvaluationService(prisma, { runAgent: jest.fn() } as any);

    await service.approveDatasetReview('admin-user', 'dataset-1');

    expect(prisma.evaluationDataset.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'dataset-1' },
      data: {
        metadata: expect.objectContaining({
          review: expect.objectContaining({
            status: 'APPROVED',
            reviewedByUserId: 'admin-user',
            reviewedAt: expect.any(String),
          }),
        }),
      },
    }));
  });

  it('按 repeatCount 重复运行并聚合 P95、Token 与成本证据', async () => {
    const prisma: any = createPrismaMock();
    const cases = Array.from({ length: 10 }, (_, index) => ({
      id: `case-${index + 1}`,
      key: `case-${index + 1}`,
      input: { message: '开始' },
      expectedOutput: { keywords: ['通过'] },
      metadata: releaseMetadata(index),
    }));
    prepareEvaluation(
      prisma,
      { id: 'evaluator-1', type: 'KEYWORD', config: { minScore: 100 } },
      cases,
    );
    prisma.evaluationDataset.findFirst.mockResolvedValue({
      id: 'dataset-1',
      frozenAt: new Date('2026-10-05T00:00:00.000Z'),
      contentHash: `sha256:${'a'.repeat(64)}`,
      metadata: { review: { status: 'APPROVED' } },
      cases,
    });
    let callIndex = 0;
    const runtime = {
      runAgent: jest.fn().mockImplementation(async () => {
        callIndex += 1;
        const sample = ((callIndex - 1) % 3) + 1;
        return {
          id: `run-${callIndex}`,
          latencyMs: sample * 100,
          tokenUsage: { totalTokens: sample * 10 },
          estimatedCost: sample * 0.01,
          output: { response: '通过' },
        };
      }),
    };
    const service = new EvaluationService(prisma, runtime as any);

    await service.runEvaluation('user-a', 'agent-1', {
      datasetId: 'dataset-1', evaluatorId: 'evaluator-1', repeatCount: 3,
      maxEstimatedCostCny: 2,
    });

    expect(runtime.runAgent).toHaveBeenCalledTimes(30);
    expect(prisma.evaluationResult.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        passed: true,
        metrics: expect.objectContaining({ repeatCount: 3, latency: { p95Ms: 300 } }),
        evidence: expect.objectContaining({ runIds: ['run-1', 'run-2', 'run-3'] }),
      }),
    }));
    expect(prisma.agentEvaluationRun.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        metrics: expect.objectContaining({
          repeatCount: 3,
          cachePolicy: 'semantic-cache-bypass/v1',
          latency: expect.objectContaining({ p95Ms: 300 }),
          tokenUsage: expect.objectContaining({ status: 'available', totalTokens: 600 }),
          estimatedCost: expect.objectContaining({ status: 'available', totalCny: 0.6 }),
          budget: expect.objectContaining({
            status: 'within-limit', limitCny: 2, spentCny: 0.6, completedSamples: 30,
          }),
          stratification: expect.objectContaining({
            status: 'available',
            caseCount: 10,
            requiredDimensions: ['jobFamily', 'skill', 'difficulty'],
          }),
        }),
      }),
    }));
  });

  it('在调用 Provider 前拒绝缺少业务切片标签的发布评测', async () => {
    const prisma: any = createPrismaMock();
    const cases = Array.from({ length: 10 }, (_, index) => ({
      id: `case-${index + 1}`,
      key: `case-${index + 1}`,
      input: { message: '开始' },
      expectedOutput: { keywords: ['通过'] },
      metadata: null,
    }));
    prepareEvaluation(
      prisma,
      { id: 'evaluator-1', type: 'KEYWORD', config: { minScore: 100 } },
      cases,
    );
    prisma.evaluationDataset.findFirst.mockResolvedValue({
      id: 'dataset-1', frozenAt: new Date(), contentHash: 'sha256:dataset', cases,
    });
    const runtime = { runAgent: jest.fn() };
    const service = new EvaluationService(prisma, runtime as any);

    await expect(service.runEvaluation('user-a', 'agent-1', {
      datasetId: 'dataset-1', evaluatorId: 'evaluator-1', repeatCount: 3,
    })).rejects.toThrow('发布 Dataset 分层证据不足');

    expect(runtime.runAgent).not.toHaveBeenCalled();
    expect(prisma.agentEvaluationRun.create).not.toHaveBeenCalled();
  });

  it('在调用 Provider 前拒绝未批准或未声明成本阈值的发布评测', async () => {
    const prisma: any = createPrismaMock();
    const cases = Array.from({ length: 10 }, (_, index) => ({
      id: `case-${index + 1}`,
      key: `case-${index + 1}`,
      input: { message: '开始' },
      expectedOutput: { keywords: ['通过'] },
      metadata: releaseMetadata(index),
    }));
    prepareEvaluation(prisma, { id: 'evaluator-1', type: 'KEYWORD', config: {} }, cases);
    prisma.evaluationDataset.findFirst.mockResolvedValue({
      id: 'dataset-1', frozenAt: new Date(), contentHash: 'sha256:dataset',
      metadata: { review: { status: 'PENDING' } }, cases,
    });
    const runtime = { runAgent: jest.fn() };
    const service = new EvaluationService(prisma, runtime as any);

    await expect(service.runEvaluation('user-a', 'agent-1', {
      datasetId: 'dataset-1', evaluatorId: 'evaluator-1', repeatCount: 3,
      maxEstimatedCostCny: 2,
    })).rejects.toThrow('管理员先审查并批准');

    prisma.evaluationDataset.findFirst.mockResolvedValue({
      id: 'dataset-1', frozenAt: new Date(), contentHash: 'sha256:dataset',
      metadata: { review: { status: 'APPROVED' } }, cases,
    });
    await expect(service.runEvaluation('user-a', 'agent-1', {
      datasetId: 'dataset-1', evaluatorId: 'evaluator-1', repeatCount: 3,
    })).rejects.toThrow('maxEstimatedCostCny');
    expect(runtime.runAgent).not.toHaveBeenCalled();
    expect(prisma.agentEvaluationRun.create).not.toHaveBeenCalled();
  });

  it('达到成本停止阈值后不再调用 Provider，并保存失败预算证据', async () => {
    const prisma: any = createPrismaMock();
    const cases = Array.from({ length: 10 }, (_, index) => ({
      id: `case-${index + 1}`,
      key: `case-${index + 1}`,
      input: { message: '开始' },
      expectedOutput: { keywords: ['通过'] },
      metadata: releaseMetadata(index),
    }));
    prepareEvaluation(prisma, { id: 'evaluator-1', type: 'KEYWORD', config: {} }, cases);
    prisma.evaluationDataset.findFirst.mockResolvedValue({
      id: 'dataset-1', frozenAt: new Date(), contentHash: 'sha256:dataset',
      metadata: { review: { status: 'APPROVED' } }, cases,
    });
    const runtime = {
      runAgent: jest.fn().mockResolvedValue({
        id: 'run-1', estimatedCost: 0.6, tokenUsage: { totalTokens: 10 },
        latencyMs: 10, output: { response: '通过' },
      }),
    };
    const service = new EvaluationService(prisma, runtime as any);

    await expect(service.runEvaluation('user-a', 'agent-1', {
      datasetId: 'dataset-1', evaluatorId: 'evaluator-1', repeatCount: 3,
      maxEstimatedCostCny: 1,
    })).rejects.toThrow('超过停止阈值');

    expect(runtime.runAgent).toHaveBeenCalledTimes(2);
    expect(prisma.agentEvaluationRun.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'FAILED',
        metrics: {
          repeatCount: 3,
          totalSamples: 30,
          budget: expect.objectContaining({
            status: 'stopped', limitCny: 1, spentCny: 1.2, completedSamples: 2,
          }),
        },
      }),
    }));
  });

  it.each(['runtime-failure', 'unknown-cost', 'negative-cost', 'nonfinite-cost'])(
    '发布样本出现 %s 后立即停止，保留已核验费用及中断标识', async (failure) => {
      const prisma: any = createPrismaMock();
      const cases = Array.from({ length: 10 }, (_, index) => ({
        id: `case-${index + 1}`, key: `case-${index + 1}`,
        input: { message: '开始' }, expectedOutput: { keywords: ['通过'] },
        metadata: releaseMetadata(index),
      }));
      prepareEvaluation(prisma, { id: 'evaluator-1', type: 'KEYWORD', config: {} }, cases);
      prisma.evaluationDataset.findFirst.mockResolvedValue({
        id: 'dataset-1', frozenAt: new Date(), contentHash: 'sha256:dataset',
        metadata: { review: { status: 'APPROVED' } }, cases,
      });
      const runtime = { runAgent: jest.fn().mockResolvedValueOnce({
        id: 'run-1', estimatedCost: 0.2, output: { response: '通过' },
      }) };
      if (failure === 'runtime-failure') {
        const error = Object.assign(new Error('Provider failed after partial usage'), { agentLabRunId: 'run-2' });
        runtime.runAgent.mockRejectedValueOnce(error);
      } else {
        runtime.runAgent.mockResolvedValueOnce({
          id: 'run-2', output: { response: '通过' },
          estimatedCost: failure === 'unknown-cost' ? null : failure === 'negative-cost' ? -1 : Infinity,
        });
      }
      const service = new EvaluationService(prisma, runtime as any);

      await expect(service.runEvaluation('user-a', 'agent-1', {
        datasetId: 'dataset-1', evaluatorId: 'evaluator-1', repeatCount: 3,
        maxEstimatedCostCny: 1,
      })).rejects.toThrow('已停止后续 Provider 调用');

      expect(runtime.runAgent).toHaveBeenCalledTimes(2);
      expect(prisma.agentEvaluationRun.update).toHaveBeenLastCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          metrics: { repeatCount: 3, totalSamples: 30, budget: expect.objectContaining({
            status: 'stopped', limitCny: 1, spentCny: 0.2,
            completedSamples: failure === 'runtime-failure' ? 1 : 2,
            costEvidenceStatus: 'unavailable', interruptedRunId: 'run-2',
          }) },
        }),
      }));
      expect(prisma.evaluationResult.create).not.toHaveBeenCalled();
    },
  );

  it('拒绝在未冻结 Dataset 上生成三次以上的发布证据', async () => {
    const prisma: any = createPrismaMock();
    prepareEvaluation(
      prisma,
      { id: 'evaluator-1', type: 'KEYWORD', config: { minScore: 100 } },
      [{ id: 'case-1', input: { message: '开始' }, expectedOutput: { keywords: ['通过'] } }],
    );
    const runtime = { runAgent: jest.fn() };
    const service = new EvaluationService(prisma, runtime as any);

    await expect(service.runEvaluation('user-a', 'agent-1', {
      datasetId: 'dataset-1', evaluatorId: 'evaluator-1', repeatCount: 3,
    })).rejects.toBeInstanceOf(BadRequestException);

    expect(runtime.runAgent).not.toHaveBeenCalled();
    expect(prisma.agentEvaluationRun.create).not.toHaveBeenCalled();
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
    const runError: any = new Error('运行时不可用');
    runError.agentLabRunId = 'run-1';
    const runtime = {
      runAgent: jest.fn().mockRejectedValue(runError),
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
          runId: 'run-1',
          passed: false,
          failureCategory: 'RUN_FAILED',
          failureMessage: '运行时不可用',
        }),
      }),
    );
    expect(prisma.agentEvaluationRun.update).toHaveBeenCalledWith(
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
    expect(prisma.agentEvaluationRun.create).not.toHaveBeenCalled();
  });

  it('允许显式指定草稿版本进入发布前评测', async () => {
    const prisma: any = createPrismaMock();
    prisma.agent.findFirst.mockResolvedValue({
      id: 'agent-1',
      currentVersion: publishedVersion,
    });
    prisma.agentVersion.findFirst.mockResolvedValue({
      id: 'version-draft',
      version: '1.0.1',
      status: 'DRAFT',
    });
    prisma.evaluationDataset.findFirst.mockResolvedValue({
      id: 'dataset-1',
      cases: [{ id: 'case-1', input: { message: '开始' }, expectedOutput: {} }],
    });
    prisma.evaluator.findFirst.mockResolvedValue({
      id: 'evaluator-1',
      type: 'JSON_SCHEMA',
      config: {},
    });
    prisma.agentEvaluationRun.create.mockResolvedValue({ id: 'evaluation-1' });
    prisma.agentEvaluationRun.update.mockResolvedValue({ id: 'evaluation-1', status: 'COMPLETED' });
    const runtime = {
      runAgent: jest.fn().mockResolvedValue({ id: 'run-1', output: {} }),
    };
    const service = new EvaluationService(prisma, runtime as any);

    await service.runEvaluation('user-a', 'agent-1', {
      datasetId: 'dataset-1',
      evaluatorId: 'evaluator-1',
      agentVersionId: 'version-draft',
    });

    expect(runtime.runAgent).toHaveBeenCalledWith(
      'user-a',
      'agent-1',
      expect.objectContaining({ agentVersionId: 'version-draft' }),
      { allowDraftVersion: true, bypassSemanticCache: true },
    );
  });

  it('不允许隐式选择草稿版本', async () => {
    const prisma: any = createPrismaMock();
    prisma.agent.findFirst.mockResolvedValue({
      id: 'agent-1',
      currentVersion: { id: 'version-draft', status: 'DRAFT' },
    });
    const service = new EvaluationService(prisma, { runAgent: jest.fn() } as any);

    await expect(
      service.runEvaluation('user-a', 'agent-1', {
        datasetId: 'dataset-1',
        evaluatorId: 'evaluator-1',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
