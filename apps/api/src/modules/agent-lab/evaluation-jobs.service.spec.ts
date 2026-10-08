jest.mock('../../infra/prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('./evaluation.service', () => ({ EvaluationService: class {} }));
import { ConflictException } from '@nestjs/common';
import { EvaluationJobsService, EVALUATION_JOB_LEASE_MS } from './evaluation-jobs.service';
import { tenantContext } from '../organizations/tenant-context';

describe('durable evaluation jobs', () => {
  let prisma: any, evaluations: any, jobs: EvaluationJobsService;
  const dto = { datasetId: 'dataset', evaluatorId: 'evaluator', requestKey: 'synthetic-request-key-1' };
  const prepared = { workspace: { id: 'workspace' }, version: { id: 'version' }, dataset: { cases: [{}] }, repeatCount: 1, effectiveBudgetCny: null, assetHash: 'hash' };
  const scope = (fn: () => any) => tenantContext.run({ organizationId: 'org', userId: 'admin' }, fn);
  beforeEach(() => {
    prisma = { organization: { findMany: jest.fn().mockResolvedValue([{ id: 'org' }]) }, user: { findFirst: jest.fn().mockResolvedValue({ role: 'ADMIN' }) },
      agentEvaluationRun: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(async ({ data }) => ({ id: 'job', ...data })), updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    evaluations = { prepareEvaluation: jest.fn().mockResolvedValue(prepared), runEvaluation: jest.fn().mockResolvedValue({}), getEvaluation: jest.fn() };
    jobs = new EvaluationJobsService(prisma, evaluations);
  });
  afterEach(() => jobs.onModuleDestroy());
  it('persists PENDING and returns a receipt without calling a model', async () => {
    expect(await scope(() => jobs.enqueue('admin', 'agent', dto))).toMatchObject({ id: 'job', status: 'PENDING', statusUrl: '/api/agent-lab/evaluations/job', reused: false });
    expect(evaluations.runEvaluation).not.toHaveBeenCalled();
    expect(prisma.agentEvaluationRun.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ requestedByUserId: 'admin', agentVersionId: 'version' }) }));
  });
  it('reuses identical keys and rejects key reuse for different assets', async () => {
    const first = await scope(() => jobs.enqueue('admin', 'agent', dto));
    const stored = { ...prisma.agentEvaluationRun.create.mock.calls[0][0].data, ...first };
    prisma.agentEvaluationRun.findFirst.mockResolvedValue(stored);
    expect(await scope(() => jobs.enqueue('admin', 'agent', dto))).toMatchObject({ reused: true });
    evaluations.prepareEvaluation.mockResolvedValue({ ...prepared, assetHash: 'changed' });
    await expect(scope(() => jobs.enqueue('admin', 'agent', dto))).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.agentEvaluationRun.create).toHaveBeenCalledTimes(1);
  });
  it('handles competing inserts and blocks different active requests', async () => {
    prisma.agentEvaluationRun.create.mockRejectedValue({ code: 'P2002' });
    await expect(scope(() => jobs.enqueue('admin', 'agent', dto))).rejects.toThrow('已有排队');
    expect(evaluations.runEvaluation).not.toHaveBeenCalled();
  });
  it('rejects an untrusted caller identity', async () => {
    await expect(scope(() => jobs.enqueue('another-admin', 'agent', dto))).rejects.toMatchObject({ status: 403 });
    expect(evaluations.prepareEvaluation).not.toHaveBeenCalled();
  });
  it('cancels queued work without invoking a model and requests cooperative cancellation for running work', async () => {
    evaluations.getEvaluation.mockResolvedValue({ id: 'job', requestKey: 'fixture', status: 'PENDING' });
    await scope(() => jobs.cancel('admin', 'job'));
    expect(prisma.agentEvaluationRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'job', status: 'PENDING' }, data: expect.objectContaining({ status: 'CANCELLED', metrics: expect.objectContaining({ budget: expect.objectContaining({ spentCny: 0 }) }) }) }));
    evaluations.getEvaluation.mockResolvedValue({ id: 'job', requestKey: 'fixture', status: 'RUNNING' });
    await scope(() => jobs.cancel('admin', 'job'));
    expect(prisma.agentEvaluationRun.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { id: 'job', status: 'RUNNING', cancelRequestedAt: null }, data: { cancelRequestedAt: expect.any(Date) } }));
    expect(evaluations.runEvaluation).not.toHaveBeenCalled();
  });
  it('checks cancellation at sample boundaries and preserves measured progress first', async () => {
    prisma.agentEvaluationRun.findFirst.mockResolvedValue({ ...pending(), cancelRequestedAt: new Date() });
    evaluations.runEvaluation.mockImplementation(async (_u, _a, _d, job) => {
      await expect(job.progress({ completedSamples: 1, completedCases: 0, spentCny: 0.02, limitCny: 1, costEvidenceStatus: 'available' })).rejects.toThrow('EVALUATION_CANCELLED');
    });
    await jobs.tick();
    expect(prisma.agentEvaluationRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ completedSamples: 1, metrics: expect.objectContaining({ budget: expect.objectContaining({ spentCny: 0.02 }) }) }) }));
  });
  it('continues past a page of idle tenants rather than starving later organizations', async () => {
    prisma.organization.findMany.mockResolvedValueOnce(Array.from({ length: 50 }, (_, i) => ({ id: `org-${String(i).padStart(2, '0')}` }))).mockResolvedValueOnce([{ id: 'org-50' }]);
    prisma.agentEvaluationRun.findFirst.mockResolvedValueOnce(null);
    await jobs.tick();
    prisma.agentEvaluationRun.findFirst.mockResolvedValue(pending());
    await jobs.tick();
    expect(prisma.organization.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { id: { gt: 'org-49' } } }));
    expect(evaluations.runEvaluation).toHaveBeenCalledTimes(1);
  });
  function pending() {
    return { id: 'job', agentId: 'agent', requestedByUserId: 'admin', totalCases: 1,
      requestParams: { contract: 'evaluation-job/v1', assetHash: 'hash', dto } };
  }
  it('only the winning atomic claimant executes, and concurrent ticks never double-run', async () => {
    prisma.agentEvaluationRun.findFirst.mockResolvedValue(pending());
    prisma.agentEvaluationRun.updateMany.mockResolvedValue({ count: 0 });
    await jobs.tick(); expect(evaluations.runEvaluation).not.toHaveBeenCalled();
    prisma.agentEvaluationRun.updateMany.mockResolvedValue({ count: 1 });
    await Promise.all([jobs.tick(), jobs.tick()]); expect(evaluations.runEvaluation).toHaveBeenCalledTimes(1);
    expect(evaluations.runEvaluation.mock.calls[0][3]).toMatchObject({ id: 'job', assetHash: 'hash' });
  });
  it('persists progress and refuses to continue after losing the lease', async () => {
    prisma.agentEvaluationRun.findFirst.mockResolvedValue(pending());
    evaluations.runEvaluation.mockImplementation(async (_u, _a, _d, job) => {
      await job.progress({ completedSamples: 1, completedCases: 0, spentCny: 0.01, limitCny: 1 });
      prisma.agentEvaluationRun.updateMany.mockResolvedValue({ count: 0 });
      await expect(job.progress({ completedSamples: 2 })).rejects.toThrow('LEASE_LOST');
    });
    await jobs.tick();
    expect(prisma.agentEvaluationRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ completedSamples: 1, completedCases: 0 }) }));
  });
  it('does not execute for revoked administrator permission', async () => {
    prisma.agentEvaluationRun.findFirst.mockResolvedValue(pending());
    prisma.user.findFirst.mockResolvedValue({ role: 'USER' });
    await jobs.tick(); expect(evaluations.runEvaluation).not.toHaveBeenCalled();
    expect(prisma.agentEvaluationRun.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED', error: expect.stringContaining('PERMISSION_REVOKED') }) }));
  });
  it('marks expired jobs failed with unknown cost, retains partial evidence, never requeues', async () => {
    prisma.agentEvaluationRun.findMany.mockResolvedValue([{ id: 'stale', metrics: { budget: { spentCny: 0.07 }, repeatCount: 3 } }]);
    await scope(() => jobs.recoverExpired());
    const update = prisma.agentEvaluationRun.updateMany.mock.calls[0][0];
    expect(update.data).toMatchObject({ status: 'FAILED', metrics: { repeatCount: 3, budget: { spentCny: 0.07, costEvidenceStatus: 'unavailable' } } });
    expect(Date.now() - update.where.heartbeatAt.lt.getTime()).toBeGreaterThanOrEqual(EVALUATION_JOB_LEASE_MS);
    expect(evaluations.runEvaluation).not.toHaveBeenCalled();
  });
});
