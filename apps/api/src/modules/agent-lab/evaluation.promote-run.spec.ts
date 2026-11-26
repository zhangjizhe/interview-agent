jest.mock('./agent-runtime.service', () => ({ AgentRuntimeService: class {} }));
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { EvaluationService } from './evaluation.service';

describe('EvaluationService.promoteRunToDataset (Bad Case -> Regression Case)', () => {
  const buildService = (overrides?: {
    run?: any;
    dataset?: any;
    createCase?: jest.Mock;
  }) => {
    const prisma: any = {
      workspace: {
        findFirst: jest.fn().mockResolvedValue({ id: 'ws-1', organizationId: 'org-1' }),
        upsert: jest.fn().mockResolvedValue({ id: 'ws-1', organizationId: 'org-1' }),
      },
      evaluationDataset: {
        findFirst: jest.fn().mockResolvedValue(
          overrides?.dataset !== undefined
            ? overrides.dataset
            : { id: 'ds-1', workspaceId: 'ws-1', frozenAt: null },
        ),
      },
      evaluationCase: {
        create: overrides?.createCase ?? jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'case-1', ...data })),
      },
      runFeedback: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'fb-1', ...data })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      run: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const runtime: any = {
      getRun: jest.fn().mockImplementation(async () => {
        if (overrides?.run === null) throw new NotFoundException('Run 不存在或无权访问');
        return overrides?.run ?? {
          id: 'cmwuk37ph03innjz7m1iv0rbw',
          agentId: 'agent-1',
          agentVersionId: 'ver-1',
          status: 'FAILED',
          application: 'interview',
          input: {
            message: '联系我 test@example.com 密钥 sk-secret1234567890 手机 13800138000，解释熔断器',
            position: 'AI Agent Engineer',
            level: 'P6',
          },
        };
      }),
    };
    const service = new EvaluationService(prisma, runtime);
    return { service, prisma, runtime };
  };

  it('sanitizes PII/secrets and promotes a Run into an unfrozen dataset with provenance', async () => {
    const { service, prisma } = buildService();
    const created = await service.promoteRunToDataset('admin-1', 'cmwuk37ph03innjz7m1iv0rbw', {
      datasetId: 'ds-1',
      expectedKeywords: ['熔断', '降级'],
      forbiddenKeywords: ['sk-'],
      note: '线上答偏，需加入回归集',
    });

    expect(created.id).toBe('case-1');
    const args = prisma.evaluationCase.create.mock.calls[0][0].data;
    expect(args.key).toMatch(/^badcase-[a-z0-9]+$/);
    expect(args.input.message).toContain('[REDACTED_EMAIL]');
    expect(args.input.message).toContain('[REDACTED_SECRET]');
    expect(args.input.message).toContain('[REDACTED_PHONE]');
    expect(args.input.message).not.toContain('test@example.com');
    expect(args.input.message).not.toContain('sk-secret1234567890');
    expect(args.input.position).toBe('AI Agent Engineer');
    expect(args.expectedOutput).toEqual({
      mustInclude: ['熔断', '降级'],
      mustNotInclude: ['sk-'],
    });
    expect(args.metadata).toMatchObject({
      source: 'run-promotion',
      sourceRunId: 'cmwuk37ph03innjz7m1iv0rbw',
      sourceAgentId: 'agent-1',
      sourceAgentVersionId: 'ver-1',
      sourceStatus: 'FAILED',
      promotedBy: 'admin-1',
      note: '线上答偏，需加入回归集',
    });
  });

  it('rejects frozen datasets with 409 ConflictException', async () => {
    const { service } = buildService({
      dataset: { id: 'ds-frozen', workspaceId: 'ws-1', frozenAt: new Date() },
    });
    await expect(
      service.promoteRunToDataset('admin-1', 'run-1', { datasetId: 'ds-frozen' }),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects runs without replayable message input with 400 BadRequestException', async () => {
    const { service } = buildService({
      run: { id: 'run-empty', agentId: 'a1', agentVersionId: 'v1', status: 'FAILED', input: {} },
    });
    await expect(
      service.promoteRunToDataset('admin-1', 'run-empty', { datasetId: 'ds-1' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects missing or foreign runs with 404 NotFoundException', async () => {
    const { service } = buildService({ run: null });
    await expect(
      service.promoteRunToDataset('admin-1', 'foreign-run', { datasetId: 'ds-1' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('stamps promotedCaseId on unpromoted DOWN feedbacks when promoting a run', async () => {
    const { service, prisma } = buildService();
    await service.promoteRunToDataset('admin-1', 'cmwuk37ph03innjz7m1iv0rbw', {
      datasetId: 'ds-1',
    });
    expect(prisma.runFeedback.updateMany).toHaveBeenCalledWith({
      where: { runId: 'cmwuk37ph03innjz7m1iv0rbw', rating: 'DOWN', promotedCaseId: null },
      data: { promotedCaseId: 'case-1' },
    });
  });

  it('submits sanitized consumer/operator feedback for a persisted Run', async () => {
    const { service, prisma } = buildService();
    const fb = await service.submitRunFeedback('user-1', 'cmwuk37ph03innjz7m1iv0rbw', {
      rating: 'DOWN',
      category: 'shallow_followup',
      comment: '追问太浅，联系 user@example.com sk-token1234567890',
    });
    expect(fb.id).toBe('fb-1');
    const createdData = prisma.runFeedback.create.mock.calls[0][0].data;
    expect(createdData).toMatchObject({
      runId: 'cmwuk37ph03innjz7m1iv0rbw',
      rating: 'DOWN',
      category: 'shallow_followup',
      sourceApp: 'interview',
      submittedByUserId: 'user-1',
    });
    expect(createdData.comment).toContain('[REDACTED_EMAIL]');
    expect(createdData.comment).toContain('[REDACTED_SECRET]');
    expect(createdData.comment).not.toContain('user@example.com');
  });

  it('aggregates failed and downvoted runs into the Bad Case triage queue', async () => {
    const { service, prisma } = buildService();
    prisma.run.findMany.mockResolvedValue([
      {
        id: 'run-fail-1',
        agentId: 'agent-1',
        agentVersionId: 'ver-1',
        application: 'interview',
        status: 'FAILED',
        error: 'upstream error for ops@example.com',
        latencyMs: 5100,
        estimatedCost: 0.002,
        createdAt: new Date('2026-11-24T12:00:00Z'),
        agent: { id: 'agent-1', key: 'interview-coach', name: 'AI 面试官' },
        agentVersion: { id: 'ver-1', version: '2.0.0', status: 'PUBLISHED' },
        feedbacks: [],
      },
      {
        id: 'run-down-2',
        agentId: 'agent-1',
        agentVersionId: 'ver-1',
        application: 'portfolio-assistant',
        status: 'COMPLETED',
        error: null,
        latencyMs: 1200,
        estimatedCost: 0.001,
        createdAt: new Date('2026-11-24T12:05:00Z'),
        agent: { id: 'agent-1', key: 'interview-coach', name: 'AI 面试官' },
        agentVersion: { id: 'ver-1', version: '2.0.0', status: 'PUBLISHED' },
        feedbacks: [
          {
            id: 'fb-2',
            rating: 'DOWN',
            category: 'hallucination',
            comment: '编造了不存在的参数',
            sourceApp: 'portfolio-assistant',
            promotedCaseId: 'case-already-promoted',
            createdAt: new Date('2026-11-24T12:06:00Z'),
          },
        ],
      },
    ]);

    const result = await service.listBadCases('admin-1', 20);
    expect(result.summary).toEqual({
      totalBadCases: 2,
      failedRuns: 1,
      downvotedRuns: 1,
      promotedCount: 1,
      pendingTriageCount: 1,
    });
    expect(result.items[0].reasons).toEqual(['RUN_FAILED']);
    expect(result.items[0].error).toContain('[REDACTED_EMAIL]');
    expect(result.items[1].reasons).toEqual(['USER_DOWNVOTED']);
    expect(result.items[1].promotedCaseId).toBe('case-already-promoted');
  });
});
