jest.mock('./agent-runtime.service', () => ({ AgentRuntimeService: class {} }));
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { EvaluationJobsService, EVALUATION_JOB_LEASE_MS } from './evaluation-jobs.service';
import { EvaluationService } from './evaluation.service';
import { tenantContext } from '../organizations/tenant-context';
import { tenantMiddleware } from '../organizations/tenant-policy';

const url = process.env.TENANT_TEST_DATABASE_URL;
(url ? describe : describe.skip)('evaluation jobs: real isolated PostgreSQL, offline runtime', () => {
  let raw: PrismaClient, scoped: PrismaClient, evaluations: EvaluationService, jobs: EvaluationJobsService, runtime: any;
  const fixture = `jobs-${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const scope = (fn: () => any, org = fixture) => tenantContext.run({ organizationId: org, userId: org }, fn);
  const request = (suffix: string) => ({ datasetId: `${fixture}-dataset`, evaluatorId: `${fixture}-evaluator`, requestKey: `synthetic-request-${suffix}` });
  async function drain() { for (let i = 0; i < 4; i++) await jobs.tick(); }
  beforeAll(async () => {
    if (!url?.includes('phase2_')) throw new Error('Only isolated phase2_ fixture databases are allowed');
    raw = new PrismaClient({ datasources: { db: { url } } });
    scoped = new PrismaClient({ datasources: { db: { url } } }); scoped.$use(tenantMiddleware);
    await raw.organization.create({ data: { id: fixture, name: 'Synthetic fixture', planId: 'free' } });
    await raw.user.create({ data: { id: fixture, email: `${fixture}@example.invalid`, organizationId: fixture, role: 'ADMIN' } });
    await raw.organization.create({ data: { id: `${fixture}-other`, name: 'Synthetic other tenant', planId: 'free' } });
    await raw.user.create({ data: { id: `${fixture}-other`, email: `${fixture}-other@example.invalid`, organizationId: `${fixture}-other`, role: 'ADMIN' } });
    await raw.workspace.create({ data: { id: `${fixture}-workspace`, ownerId: fixture, slug: `personal-${fixture}`, name: 'Synthetic fixture', organizationId: fixture } });
    await raw.agent.create({ data: { id: `${fixture}-agent`, key: 'fixture', name: 'Fixture', type: 'fixture', workspaceId: `${fixture}-workspace`, organizationId: fixture } });
    await raw.agentVersion.create({ data: { id: `${fixture}-version`, agentId: `${fixture}-agent`, version: '1.0.0', status: 'PUBLISHED', organizationId: fixture } });
    await raw.agent.update({ where: { id: `${fixture}-agent` }, data: { currentVersionId: `${fixture}-version` } });
    await raw.evaluationDataset.create({ data: { id: `${fixture}-dataset`, workspaceId: `${fixture}-workspace`, key: 'fixture', name: 'Synthetic dataset', organizationId: fixture } });
    await raw.evaluationCase.create({ data: { datasetId: `${fixture}-dataset`, key: 'synthetic-case', input: { message: 'synthetic fixture' }, expectedOutput: { keywords: ['fixture'] }, organizationId: fixture } });
    await raw.evaluator.create({ data: { id: `${fixture}-evaluator`, workspaceId: `${fixture}-workspace`, key: 'fixture', name: 'Fixture', type: 'KEYWORD', organizationId: fixture } });
    runtime = { runAgent: jest.fn(async (_user, _agent, dto) => raw.run.create({ data: {
      workspaceId: `${fixture}-workspace`, agentId: `${fixture}-agent`, agentVersionId: `${fixture}-version`,
      input: dto.input, output: { response: 'fixture' }, status: 'COMPLETED', organizationId: fixture,
      estimatedCost: 0.001, latencyMs: 1, tokenUsage: { totalTokens: 15 },
    } })) };
    evaluations = new EvaluationService(scoped as any, runtime);
    jobs = new EvaluationJobsService(scoped as any, evaluations);
  });
  afterAll(async () => { jobs?.onModuleDestroy(); await Promise.all([raw?.$disconnect(), scoped?.$disconnect()]); });
  it('20 identical submissions produce one durable job and one execution across replicas', async () => {
    const receipts = await scope(() => Promise.all(Array.from({ length: 20 }, () => jobs.enqueue(fixture, `${fixture}-agent`, request('same')))));
    expect(new Set(receipts.map(r => r.id)).size).toBe(1);
    expect(runtime.runAgent).not.toHaveBeenCalled();
    const replica = new EvaluationJobsService(scoped as any, evaluations);
    try { await Promise.all([jobs.tick(), replica.tick()]); } finally { replica.onModuleDestroy(); }
    const result = await scope(() => evaluations.getEvaluation(fixture, receipts[0].id));
    expect(result).toMatchObject({ status: 'COMPLETED', completedCases: 1, completedSamples: 1, score: 100 });
    expect(result.results).toHaveLength(1); expect(runtime.runAgent).toHaveBeenCalledTimes(1);
    expect(await raw.usageLedger.count({ where: { organizationId: fixture } })).toBe(0);
  });
  it('blocks different active requests, isolates tenants, and preserves failed idempotency', async () => {
    const accepted = await scope(() => jobs.enqueue(fixture, `${fixture}-agent`, request('active')));
    await expect(scope(() => jobs.enqueue(fixture, `${fixture}-agent`, request('other')))).rejects.toMatchObject({ status: 409 });
    await expect(scope(() => evaluations.getEvaluation(`${fixture}-other`, accepted.id), `${fixture}-other`)).rejects.toMatchObject({ status: 404 });
    await raw.agentEvaluationRun.update({ where: { id: accepted.id }, data: { status: 'RUNNING', leaseOwner: 'crashed', heartbeatAt: new Date(Date.now() - EVALUATION_JOB_LEASE_MS - 1000), metrics: { budget: { spentCny: 0.02 } } } });
    await scope(() => jobs.recoverExpired());
    const failed = await raw.agentEvaluationRun.findUniqueOrThrow({ where: { id: accepted.id } });
    expect(failed).toMatchObject({ status: 'FAILED', metrics: { budget: { spentCny: 0.02, costEvidenceStatus: 'unavailable' } } });
    expect(await scope(() => jobs.enqueue(fixture, `${fixture}-agent`, request('active')))).toMatchObject({ id: accepted.id, reused: true, status: 'FAILED' });
    expect(runtime.runAgent).toHaveBeenCalledTimes(1);
  });
  it('fails changed assets or revoked permissions before any additional execution', async () => {
    const accepted = await scope(() => jobs.enqueue(fixture, `${fixture}-agent`, request('assets')));
    await raw.evaluator.update({ where: { id: `${fixture}-evaluator` }, data: { config: { minScore: 50 } } });
    await drain();
    expect((await raw.agentEvaluationRun.findUniqueOrThrow({ where: { id: accepted.id } })).status).toBe('FAILED');
    const revoked = await scope(() => jobs.enqueue(fixture, `${fixture}-agent`, request('revoked')));
    await raw.user.update({ where: { id: fixture }, data: { role: 'USER' } });
    await drain();
    expect((await raw.agentEvaluationRun.findUniqueOrThrow({ where: { id: revoked.id } })).error).toContain('PERMISSION_REVOKED');
    expect(runtime.runAgent).toHaveBeenCalledTimes(1);
  });
});
