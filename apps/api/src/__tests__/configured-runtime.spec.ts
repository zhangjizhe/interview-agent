import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateConfiguredAgentDto } from '../modules/agent-lab/dto/agent.dto';
import { assertSchema, validateConfiguredVersion } from '../modules/agent-lab/configured-runtime.contract';
import { ConfiguredRuntimeService, RuntimeCancelledError } from '../modules/agent-lab/configured-runtime.service';
import { ConfiguredRunJobsService } from '../modules/agent-lab/configured-run-jobs.service';
import { tenantContext } from '../modules/organizations/tenant-context';

jest.mock('../infra/prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../modules/llm/llm.gateway.service', () => ({ LlmGatewayService: class {} }));
jest.mock('../modules/llm/cost/llm-pricing-catalog.service', () => ({ LlmPricingCatalogService: class {} }));
jest.mock('../modules/agent-lab/trace-event.service', () => ({ TraceEventService: class {} }));
jest.mock('../modules/agent/multi-agent.service', () => ({ MultiAgentService: class {} }));
jest.mock('../modules/agent-lab/agent-runtime.service', () => ({ AgentRuntimeService: class {} }));
const schema = { type: 'object', properties: { message: { type: 'string', maxLength: 10000 } }, required: ['message'], additionalProperties: false };
function single(id = 'version-one', extra: any = {}) {
  return { id, agentId: `agent-${id}`, status: 'PUBLISHED', systemPrompt: 'Synthetic test instruction',
    runtimeConfig: { adapter: 'single-agent-v1', maxEstimatedCostCny: 1, maxDurationMs: 1000 },
    modelConfig: { provider: 'qwen', maxTokens: 20, temperature: 0 }, inputSchema: schema,
    outputSchema: { type: 'object', properties: { response: { type: 'string' } }, required: ['response'], additionalProperties: false }, ...extra };
}
function workflow(nodes: any[]) { return single('workflow', { modelConfig: {}, runtimeConfig: { adapter: 'finite-workflow-v1', maxEstimatedCostCny: 1, maxDurationMs: 1000, nodes } }); }
function harness() {
  const run = { id: 'parent', workspaceId: 'workspace', status: 'RUNNING', leaseOwner: 'owner-one' };
  const prisma = { agentVersion: { findFirst: jest.fn() }, run: {
    findFirst: jest.fn().mockResolvedValue(run), findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockImplementation(async ({ data }) => ({ ...data, id: `child-${data.agentVersionId}` })),
    update: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  }, organization: { findMany: jest.fn().mockResolvedValue([]) } };
  const gateway = { getConfiguredModels: jest.fn().mockReturnValue([{ provider: 'qwen', model: 'synthetic-model', enabled: true }]),
    chat: jest.fn().mockResolvedValue({ content: 'synthetic output', provider: 'qwen', model: 'synthetic-model', usage: { promptTokens: 10, completionTokens: 5 } }) };
  const pricing = { estimateCall: jest.fn().mockReturnValue({ status: 'available', totalCny: 0.01 }) };
  const trace = { append: jest.fn().mockResolvedValue({}) };
  return { run, prisma, gateway, pricing, trace, service: new ConfiguredRuntimeService(prisma as any, gateway as any, pricing as any, trace as any) };
}

describe('Configured runtime independent regression', () => {
  it.each([
    ['unknown adapter', { runtimeConfig: { adapter: 'unknown', maxEstimatedCostCny: 1, maxDurationMs: 1000 } }],
    ['unbounded budget', { runtimeConfig: { adapter: 'single-agent-v1', maxEstimatedCostCny: Infinity, maxDurationMs: 1000 } }],
    ['unknown model field', { modelConfig: { provider: 'qwen', maxTokens: 20, temperature: 0, apiKey: 'synthetic-forbidden' } }],
    ['unsupported bindings', { toolBindings: { tools: ['arbitrary'] } }],
    ['invalid schema', { inputSchema: { type: 'object', required: ['missing'] } }],
  ])('rejects %s', (_name, extra) => { expect(() => validateConfiguredVersion(single('one', extra))).toThrow(); });
  it('rejects cycles and unreachable nodes', () => {
    expect(() => validateConfiguredVersion(workflow([{ id: 'aa', agentVersionId: 'one', inputFrom: 'input', next: 'aa' }]))).toThrow();
    expect(() => validateConfiguredVersion(workflow([{ id: 'aa', agentVersionId: 'one', inputFrom: 'input' }, { id: 'bb', agentVersionId: 'two', inputFrom: 'previous' }]))).toThrow();
  });
  it('enforces nested schema types, extra keys, arrays, and unsupported keywords', () => {
    expect(() => assertSchema(schema, { message: 1 })).toThrow();
    expect(() => assertSchema(schema, { message: 'ok', extra: true })).toThrow();
    expect(() => assertSchema({ type: 'array', maxItems: 1, items: { type: 'integer' } }, [1, 2])).toThrow();
    expect(() => assertSchema({ type: 'object', oneOf: [] }, {})).toThrow();
  });
  it.each([null, single('one', { status: 'DRAFT' })])('rejects missing/foreign or draft dependencies before Gateway', async child => {
    const h = harness(); h.prisma.agentVersion.findFirst.mockResolvedValue(child);
    await expect(h.service.prepare(workflow([{ id: 'aa', agentVersionId: 'one', inputFrom: 'input' }]), 'workspace')).rejects.toThrow();
    expect(h.prisma.agentVersion.findFirst).toHaveBeenCalledWith({ where: { id: 'one', parentAgent: { workspaceId: 'workspace' } } });
    expect(h.gateway.chat).not.toHaveBeenCalled();
  });
  it('allows draft dependencies only for explicit draft preparation', async () => {
    const h = harness(); h.prisma.agentVersion.findFirst.mockResolvedValue(single('one', { status: 'DRAFT' }));
    await expect(h.service.prepare(workflow([{ id: 'aa', agentVersionId: 'one', inputFrom: 'input' }]), 'workspace', true, true)).resolves.toHaveProperty('versions');
  });
  it('pins fixed dependency configuration and rejects missing or changed fingerprints', async () => {
    const h = harness(), child = single('one');
    h.prisma.agentVersion.findFirst.mockResolvedValue(child);
    const version = workflow([{ id: 'aa', agentVersionId: 'one', inputFrom: 'input' }]);
    await expect(h.service.prepare(version, 'workspace')).rejects.toThrow('指纹');
    await h.service.prepare(version, 'workspace', false, true);
    expect(version.runtimeConfig.nodes[0].versionHash).toMatch(/^[a-f0-9]{64}$/);
    await expect(h.service.prepare(version, 'workspace')).resolves.toHaveProperty('versions');
    h.prisma.agentVersion.findFirst.mockResolvedValue({ ...child, systemPrompt: 'Mutated dependency' });
    await expect(h.service.prepare(version, 'workspace')).rejects.toThrow('指纹');
    expect(h.gateway.chat).not.toHaveBeenCalled();
  });
  it.each([true, false])('runs only the selected branch and maps previous response (%s)', async matched => {
    const h = harness(); const first = single('one'), second = single('two'), third = single('three');
    const version = workflow([{ id: 'aa', agentVersionId: 'one', inputFrom: 'input', branch: { contains: 'MATCH', then: 'bb', else: 'cc' } },
      { id: 'bb', agentVersionId: 'two', inputFrom: 'previous' }, { id: 'cc', agentVersionId: 'three', inputFrom: 'previous' }]);
    h.gateway.chat.mockResolvedValueOnce({ content: matched ? 'MATCH output' : 'other output', provider: 'qwen', model: 'synthetic-model', usage: { promptTokens: 10, completionTokens: 5 } });
    const prepared = { definition: validateConfiguredVersion(version), versions: new Map([['one', first], ['two', second], ['three', third]]) };
    const result = await h.service.execute('user', h.run, version, { message: 'initial' }, prepared);
    expect(h.gateway.chat).toHaveBeenCalledTimes(2);
    expect(h.gateway.chat.mock.calls[1][0].messages[1].content).toBe(matched ? 'MATCH output' : 'other output');
    expect(result.output.nodes.map((node: any) => node.id)).toEqual(['aa', matched ? 'bb' : 'cc']);
    expect(result.tokenUsage.calls).toBe(2);
    expect(result.estimatedCostCny).toBe(0.02);
    expect(h.gateway.chat.mock.calls.every(call => call[0].allowFallback === false)).toBe(true);
  });
  it('checks budget before issuing even one Gateway call', async () => {
    const h = harness(), version = single(); h.pricing.estimateCall.mockReturnValue({ status: 'available', totalCny: 2 });
    await expect(h.service.execute('user', h.run, version, { message: 'initial' }, await h.service.prepare(version, 'workspace'))).rejects.toThrow();
    expect(h.gateway.chat).not.toHaveBeenCalled();
  });
  it('preserves parent billable evidence when output schema fails', async () => {
    const h = harness(), version = single('one', { outputSchema: { type: 'object', properties: { response: { type: 'integer' } }, required: ['response'] } });
    await expect(h.service.execute('user', h.run, version, { message: 'initial' }, await h.service.prepare(version, 'workspace'))).rejects.toThrow();
    expect(h.prisma.run.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'parent', status: 'RUNNING', leaseOwner: 'owner-one' }), data: expect.objectContaining({ estimatedCost: 0.01, tokenUsage: expect.objectContaining({ totalTokens: 15 }) }) }));
  });
  it('stops downstream work after cancellation while retaining successful call usage', async () => {
    const h = harness(), one = single('one'), two = single('two');
    const version = workflow([{ id: 'aa', agentVersionId: 'one', inputFrom: 'input', next: 'bb' }, { id: 'bb', agentVersionId: 'two', inputFrom: 'previous' }]);
    h.gateway.chat.mockImplementation(async () => { h.prisma.run.findFirst.mockResolvedValue({ ...h.run, cancelRequestedAt: new Date() }); return { content: 'first', provider: 'qwen', model: 'synthetic-model', usage: { promptTokens: 10, completionTokens: 5 } }; });
    await expect(h.service.execute('user', h.run, version, { message: 'initial' }, { definition: validateConfiguredVersion(version), versions: new Map([['one', one], ['two', two]]) })).rejects.toBeInstanceOf(RuntimeCancelledError);
    expect(h.gateway.chat).toHaveBeenCalledTimes(1);
    expect(h.prisma.run.create).toHaveBeenCalledTimes(1);
  });
  it('preserves failed child schema usage and stops later nodes', async () => {
    const h = harness(), one = single('one', { outputSchema: { type: 'object', properties: { response: { type: 'integer' } }, required: ['response'] } }), two = single('two');
    const version = workflow([{ id: 'aa', agentVersionId: 'one', inputFrom: 'input', next: 'bb' }, { id: 'bb', agentVersionId: 'two', inputFrom: 'previous' }]);
    await expect(h.service.execute('user', h.run, version, { message: 'initial' }, { definition: validateConfiguredVersion(version), versions: new Map([['one', one], ['two', two]]) })).rejects.toThrow();
    expect(h.gateway.chat).toHaveBeenCalledTimes(1);
    expect(h.prisma.run.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'child-one', status: 'RUNNING' }, data: expect.objectContaining({ estimatedCost: 0.01, tokenUsage: { promptTokens: 10, completionTokens: 5 } }) }));
    expect(h.prisma.run.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'child-one', status: 'RUNNING' }, data: expect.objectContaining({ status: 'FAILED' }) }));
  });
  it('stops on unknown actual pricing and stores null rather than zero', async () => {
    const h = harness(), version = single();
    h.pricing.estimateCall.mockReturnValueOnce({ status: 'available', totalCny: 0.01 }).mockReturnValueOnce({ status: 'unavailable' } as any);
    await expect(h.service.execute('user', h.run, version, { message: 'initial' }, await h.service.prepare(version, 'workspace'))).rejects.toThrow('费用未知');
    expect(h.gateway.chat).toHaveBeenCalledTimes(1);
    const writes = [...h.prisma.run.update.mock.calls, ...h.prisma.run.updateMany.mock.calls];
    expect(writes.some(call => call[0].data.estimatedCost === null && call[0].data.tokenUsage.totalTokens === 15)).toBe(true);
  });
  it('does not retry or fall back when the selected Gateway request fails', async () => {
    const h = harness(), version = single(); h.gateway.chat.mockRejectedValue(new Error('synthetic provider failure'));
    await expect(h.service.execute('user', h.run, version, { message: 'initial' }, await h.service.prepare(version, 'workspace'))).rejects.toThrow('synthetic provider failure');
    expect(h.gateway.chat).toHaveBeenCalledTimes(1);
    expect(h.gateway.chat.mock.calls[0][0].allowFallback).toBe(false);
  });
  it('does not overwrite terminal parent output with a late model result after lease recovery', async () => {
    const h = harness(), version = single();
    h.gateway.chat.mockImplementation(async () => {
      h.prisma.run.findFirst.mockResolvedValue({ ...h.run, status: 'FAILED' });
      return { content: 'late billable response', provider: 'qwen', model: 'synthetic-model', usage: { promptTokens: 10, completionTokens: 5 } };
    });
    await expect(h.service.execute('user', h.run, version, { message: 'initial' }, await h.service.prepare(version, 'workspace'))).rejects.toBeInstanceOf(RuntimeCancelledError);
    const unsafeOutputWrites = h.prisma.run.update.mock.calls.filter(call => call[0].where.id === 'parent' && Object.hasOwn(call[0].data, 'output'));
    expect(unsafeOutputWrites).toEqual([]);
    expect(h.trace.append).toHaveBeenCalledWith('parent', expect.objectContaining({ type: 'model.end', tokenUsage: { promptTokens: 10, completionTokens: 5 } }));
  });
  it('treats zeroed missing Provider usage as unknown cost and stops downstream nodes', async () => {
    const h = harness(), one = single('one'), two = single('two');
    const version = workflow([{ id: 'aa', agentVersionId: 'one', inputFrom: 'input', next: 'bb' }, { id: 'bb', agentVersionId: 'two', inputFrom: 'previous' }]);
    h.gateway.chat.mockResolvedValue({ content: 'Provider omitted usage', provider: 'qwen', model: 'synthetic-model', usage: { promptTokens: 0, completionTokens: 0 } });
    h.pricing.estimateCall.mockImplementation((usage: any) => ({ status: 'available', totalCny: usage.promptTokens + usage.completionTokens === 0 ? 0 : 0.01 }));
    await expect(h.service.execute('user', h.run, version, { message: 'synthetic' }, { definition: validateConfiguredVersion(version), versions: new Map([['one', one], ['two', two]]) })).rejects.toThrow();
    expect(h.gateway.chat).toHaveBeenCalledTimes(1);
    expect(h.prisma.run.updateMany.mock.calls.some(call => call[0].data.estimatedCost === null)).toBe(true);
  });
  it('does not execute after another worker owns the lease', async () => {
    const h = harness(), version = single();
    h.prisma.run.findFirst.mockResolvedValue({ ...h.run, leaseOwner: 'owner-two' });
    await expect(h.service.execute('user', h.run, version, { message: 'initial' }, await h.service.prepare(version, 'workspace'))).rejects.toBeInstanceOf(RuntimeCancelledError);
    expect(h.gateway.chat).not.toHaveBeenCalled();
  });
});

describe('Configured run queue independent regression', () => {
  function jobs() {
    const h = harness(); const runtime = { prepareConfiguredRun: jest.fn().mockResolvedValue({ workspace: { id: 'workspace' }, version: single() }), getRun: jest.fn(), runAgent: jest.fn() };
    return { ...h, runtime, jobs: new ConfiguredRunJobsService(h.prisma as any, runtime as any) };
  }
  const scoped = (action: () => Promise<any>) => tenantContext.run({ organizationId: 'synthetic-org', userId: 'user' }, action);
  it('reuses an identical request and rejects a key reused for another input', async () => {
    const h = jobs(); let stored: any;
    h.prisma.run.findFirst.mockImplementation(async () => stored ?? null);
    h.prisma.run.create.mockImplementation(async ({ data }) => { stored = { ...data, id: 'queued' }; return stored; });
    const dto = { input: { message: 'synthetic' }, requestKey: 'synthetic-request-key' };
    await expect(scoped(() => h.jobs.enqueue('user', 'agent', dto, true))).resolves.toMatchObject({ reused: false });
    await expect(scoped(() => h.jobs.enqueue('user', 'agent', dto, true))).resolves.toMatchObject({ reused: true });
    await expect(scoped(() => h.jobs.enqueue('user', 'agent', { ...dto, input: { message: 'changed' } }, true))).rejects.toThrow();
    expect(h.prisma.run.create).toHaveBeenCalledTimes(1);
  });
  it('only cancels pending/running rows and never overwrites a terminal row', async () => {
    const h = jobs(); h.runtime.getRun.mockResolvedValue({ id: 'queued', requestKey: 'key', status: 'COMPLETED' });
    await h.jobs.cancel('user', 'queued');
    expect(h.prisma.run.updateMany.mock.calls.map(call => call[0].where.status)).toEqual(['PENDING', 'RUNNING']);
    expect(h.runtime.runAgent).not.toHaveBeenCalled();
  });
  it('expires a lease without replaying it or turning unknown costs into zero', async () => {
    const h = jobs(); const heartbeatAt = new Date(0);
    h.prisma.run.findMany.mockResolvedValue([{ id: 'expired', status: 'RUNNING', heartbeatAt }]);
    await h.jobs.recoverExpired();
    expect(h.runtime.runAgent).not.toHaveBeenCalled();
    expect(h.prisma.run.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'expired', status: 'RUNNING', heartbeatAt }, data: expect.objectContaining({ status: 'FAILED' }) }));
    expect(h.prisma.run.updateMany.mock.calls.some(call => 'estimatedCost' in call[0].data)).toBe(false);
  });
});


describe('Queued runtime cancellation versus completion race', () => {
  it('cancels when a request arrives after execution returns and before completion CAS', async () => {
    const { AgentRuntimeService } = jest.requireActual('../modules/agent-lab/agent-runtime.service');
    const version = single();
    const row: any = { id: 'queued-race', status: 'RUNNING', leaseOwner: 'owner-one', cancelRequestedAt: null };
    const prisma: any = { workspace: { upsert: jest.fn().mockResolvedValue({ id: 'workspace' }) },
      agent: { findFirst: jest.fn().mockResolvedValue({ id: 'agent', currentVersion: version }) },
      run: { create: jest.fn(), update: jest.fn(), findFirst: jest.fn().mockImplementation(async () => ({ ...row })),
        updateMany: jest.fn().mockImplementation(async ({ where, data }) => {
          if (Object.keys(where).some(key => row[key] !== where[key])) return { count: 0 };
          Object.assign(row, data); return { count: 1 };
        }) } };
    const configured = { prepare: jest.fn().mockResolvedValue({}), execute: jest.fn().mockImplementation(async () => {
      row.cancelRequestedAt = new Date();
      return { response: 'synthetic completed call', output: { response: 'synthetic completed call' }, tokenUsage: { promptTokens: 10, completionTokens: 5 }, estimatedCostCny: 0.01 };
    }) };
    const trace = { append: jest.fn().mockResolvedValue({}) };
    const service = new AgentRuntimeService(prisma, { isEnabled: jest.fn() }, trace, {}, configured);
    await expect(service.runAgent('user', 'agent', { input: { message: 'synthetic' } }, { queuedRun: { ...row } })).rejects.toBeInstanceOf(RuntimeCancelledError);
    expect(row.status).toBe('CANCELLED');
    expect(prisma.run.updateMany.mock.calls[0][0].where).toMatchObject({ status: 'RUNNING', cancelRequestedAt: null, leaseOwner: 'owner-one' });
    expect(trace.append).toHaveBeenCalledWith('queued-race', expect.objectContaining({ type: 'run.cancelled', payload: expect.objectContaining({ status: 'CANCELLED' }) }));
    expect(trace.append.mock.calls.some((call: any) => call[1].type === 'turn.end')).toBe(false);
  });
});


describe('Independent delivery boundary blockers', () => {
  it.each(['', '   '])('rejects a blank configured Agent name (%s)', name => {
    const dto = plainToInstance(CreateConfiguredAgentDto, { key: 'synthetic-agent', name, type: 'CUSTOM', initialVersion: { ...single(), version: '1.0.0' } });
    expect(validateSync(dto).some(error => error.property === 'name')).toBe(true);
  });
  it('rejects configured execution via the legacy synchronous route before billable work', async () => {
    const { AgentRuntimeService } = jest.requireActual('../modules/agent-lab/agent-runtime.service');
    const { AgentRuntimeController } = jest.requireActual('../modules/agent-lab/agent-runtime.controller');
    const version = single();
    const prisma: any = { workspace: { upsert: jest.fn().mockResolvedValue({ id: 'workspace' }) }, agent: { findFirst: jest.fn().mockResolvedValue({ id: 'agent', currentVersion: version }) },
      run: { create: jest.fn().mockResolvedValue({ id: 'sync', status: 'RUNNING' }), update: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    const configured = { prepare: jest.fn().mockResolvedValue({}), execute: jest.fn().mockResolvedValue({ response: 'billable', tokenUsage: {}, estimatedCostCny: 0.01 }) };
    const runtime = new AgentRuntimeService(prisma, { isEnabled: jest.fn() }, { append: jest.fn().mockResolvedValue({}) }, {}, configured);
    const controller = new AgentRuntimeController(runtime, {}, {});
    await expect(controller.runAgent({ user: { userId: 'user' } }, 'agent', { input: { message: 'synthetic' } })).rejects.toThrow();
    expect(configured.execute).not.toHaveBeenCalled();
    expect(prisma.run.create).not.toHaveBeenCalled();
  });
  it('preserves a child cancellation made while its model response is in flight', async () => {
    const h = harness(), child = single('one');
    let childRow: any;
    h.prisma.run.create.mockImplementation(async ({ data }) => { childRow = { ...data, id: 'child-one' }; return { ...childRow }; });
    h.gateway.chat.mockImplementation(async () => {
      childRow.status = 'CANCELLED';
      return { content: 'late response', provider: 'qwen', model: 'synthetic-model', usage: { promptTokens: 10, completionTokens: 5 } };
    });
    h.prisma.run.update.mockImplementation(async ({ data }) => { Object.assign(childRow, data); return childRow; });
    h.prisma.run.updateMany.mockImplementation(async ({ where, data }) => {
      const row = where.id === 'parent' ? h.run : childRow;
      if (Object.keys(where).some(key => row[key] !== where[key])) return { count: 0 };
      Object.assign(row, data); return { count: 1 };
    });
    const version = workflow([{ id: 'aa', agentVersionId: 'one', inputFrom: 'input' }]);
    await expect(h.service.execute('user', h.run, version, { message: 'synthetic' }, { definition: validateConfiguredVersion(version), versions: new Map([['one', child]]) })).rejects.toBeInstanceOf(RuntimeCancelledError);
    expect(childRow.status).toBe('CANCELLED');
    expect(h.trace.append).toHaveBeenCalledWith('child-one', expect.objectContaining({ type: 'model.end', tokenUsage: { promptTokens: 10, completionTokens: 5 } }));
  });
});
