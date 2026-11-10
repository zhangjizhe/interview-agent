import { validateConfiguredVersion } from './configured-runtime.contract';
const version = () => ({ id: 'v', agentId: 'a', systemPrompt: 'Answer from permitted sources', modelConfig: { provider: 'qwen', maxTokens: 64, temperature: 0 }, runtimeConfig: { adapter: 'single-agent-v1', maxEstimatedCostCny: 0.05, maxDurationMs: 1000 }, knowledgeBindings: { collectionIds: ['private-articles'] } });
it('accepts only explicit bounded collection bindings for the configured single Agent', () => {
  expect(validateConfiguredVersion(version()).adapter).toBe('single-agent-v1');
});
it.each([{ collectionIds: ['same', 'same'] }, { collectionIds: Array.from({ length: 6 }, (_, i) => `c${i}`) }, { resources: ['unscoped-bank'] }, { collectionIds: ['ok'], organizationId: 'forged' }])('rejects ambiguous, unbounded or unscoped knowledge bindings', knowledgeBindings => {
  expect(() => validateConfiguredVersion({ ...version(), knowledgeBindings })).toThrow();
});

import { ConfiguredRuntimeService } from './configured-runtime.service';
import { NotFoundException } from '@nestjs/common';
jest.mock('../llm/llm.gateway.service', () => ({ LlmGatewayService: class {} }));
jest.mock('../llm/cost/llm-pricing-catalog.service', () => ({ LlmPricingCatalogService: class {} }));
jest.mock('./trace-event.service', () => ({ TraceEventService: class {} }));
function harness() {
  const run = { id: 'run', workspaceId: 'own-workspace', status: 'RUNNING' };
  const prisma = { run: { findFirst: jest.fn().mockResolvedValue(run), updateMany: jest.fn().mockResolvedValue({ count: 1 }) }, agentVersion: { findFirst: jest.fn() } };
  const gateway = { getConfiguredModels: () => [{ provider: 'qwen', model: 'synthetic', enabled: true }], chat: jest.fn().mockResolvedValue({ content: 'Grounded synthetic output', provider: 'qwen', model: 'synthetic', usage: { promptTokens: 100, completionTokens: 10 } }) };
  const pricing = { estimateCall: jest.fn().mockReturnValue({ status: 'available', totalCny: 0.001 }) }, trace = { append: jest.fn() };
  const data = { validateBindings: jest.fn(), contextForVersion: jest.fn().mockResolvedValue({ text: JSON.stringify([{ title: 'Article', content: 'PRIVATE_DATA_ONLY_FOR_AUTHORIZED_MODEL' }]), references: [{ collectionId: 'private-articles', recordId: 'record', versionId: 'record:2', revision: 2, contentHash: 'hash' }] }) };
  return { run, prisma, gateway, pricing, trace, data, service: new ConfiguredRuntimeService(prisma as any, gateway as any, pricing as any, trace as any, data as any) };
}
it('denies missing or revoked collection authorization during preparation before Gateway', async () => {
  const h = harness();h.data.validateBindings.mockRejectedValue(new NotFoundException());
  await expect(h.service.prepare(version(), 'own-workspace')).rejects.toMatchObject({ status: 404 });
  expect(h.gateway.chat).not.toHaveBeenCalled();
});
it('rechecks access during execution, so permission granted during preparation cannot bypass revocation', async () => {
  const h = harness(), v = version();const prepared = await h.service.prepare(v, 'own-workspace');
  h.data.contextForVersion.mockRejectedValue(new NotFoundException());
  await expect(h.service.execute('owner', h.run, v, { message: 'Article' }, prepared)).rejects.toMatchObject({ status: 404 });
  expect(h.gateway.chat).not.toHaveBeenCalled();expect(h.pricing.estimateCall).not.toHaveBeenCalled();
});
it('includes source bytes in the cost reservation and records references without putting private content in Trace', async () => {
  const h = harness(), v = version();const prepared = await h.service.prepare(v, 'own-workspace');
  await h.service.execute('owner', h.run, v, { message: 'Article' }, prepared);
  expect(h.data.contextForVersion).toHaveBeenCalledWith('owner', 'own-workspace', 'v', 'Article');
  const request = h.gateway.chat.mock.calls[0][0];expect(request.messages).toHaveLength(3);
  expect(request.messages[1].content).toContain('PRIVATE_DATA_ONLY_FOR_AUTHORIZED_MODEL');
  expect(h.pricing.estimateCall.mock.calls[0][0].promptTokens).toBeGreaterThan(Buffer.byteLength(request.messages.map((m: any) => m.content).join(''), 'utf8'));
  const event = h.trace.append.mock.calls.find(([, event]) => event.type === 'data.read')![1];
  expect(event.metadata.references[0]).toMatchObject({ versionId: 'record:2', revision: 2 });
  expect(JSON.stringify(h.trace.append.mock.calls)).not.toContain('PRIVATE_DATA_ONLY_FOR_AUTHORIZED_MODEL');
});
it('a workflow authorizes each node’s own bindings and cannot pool collections on the parent', async () => {
  const h = harness();const child = { ...version(), status: 'PUBLISHED' };h.prisma.agentVersion.findFirst.mockResolvedValue(child);
  const flow = { ...version(), knowledgeBindings: {}, modelConfig: {}, runtimeConfig: { adapter: 'finite-workflow-v1', maxEstimatedCostCny: 0.05, maxDurationMs: 1000, nodes: [{ id: 'node-one', agentVersionId: child.id, inputFrom: 'input' }] } };
  h.data.validateBindings.mockRejectedValue(new NotFoundException());
  await expect(h.service.prepare(flow, 'own-workspace', false, true)).rejects.toMatchObject({ status: 404 });
  expect(h.gateway.chat).not.toHaveBeenCalled();
  expect(() => validateConfiguredVersion({ ...flow, knowledgeBindings: { collectionIds: ['private-articles'] } })).toThrow();
});
it.each(['data.read', 'model.start'])('blocks dispatch when access is revoked while persisting %s', async eventType => {
  const h = harness(), v = version();
  const prepared = await h.service.prepare(v, 'own-workspace');
  h.trace.append.mockImplementation(async (_id, event) => {
    if (event.type === eventType) h.data.validateBindings.mockRejectedValue(new NotFoundException());
  });
  await expect(h.service.execute('owner', h.run, v, { message: 'Article' }, prepared)).rejects.toMatchObject({ status: 404 });
  expect(h.gateway.chat).not.toHaveBeenCalled();
});
