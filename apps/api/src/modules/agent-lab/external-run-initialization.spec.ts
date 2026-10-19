import { AgentRuntimeService } from './agent-runtime.service';
jest.mock('../../infra/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('../agent/multi-agent.service', () => ({ MultiAgentService: class MultiAgentService {} }));
jest.mock('./trace-event.service', () => ({ TraceEventService: class TraceEventService {} }));

describe('external Run required-message initialization', () => {
  const run = { id: 'synthetic-run', agentVersionId: 'version-one', startedAt: new Date() };
  let prisma: any; let trace: any; let service: AgentRuntimeService;
  beforeEach(() => {
    prisma = { agent: { findFirst: jest.fn().mockResolvedValue({ id: 'agent-one' }) }, run: {
      create: jest.fn().mockResolvedValue(run), updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    } };
    trace = { append: jest.fn().mockResolvedValue({}) };
    service = new AgentRuntimeService(prisma, {} as any, trace, {} as any);
    jest.spyOn(service as any, 'getOrCreateDefaultWorkspace').mockResolvedValue({ id: 'workspace-one' });
    jest.spyOn(service as any, 'resolveVersion').mockResolvedValue({ id: 'version-one', runtimeConfig: {} });
    jest.spyOn(service as any, 'writeTrace').mockResolvedValue(undefined);
  });
  const start = () => service.startExternalRun('user-one', 'agent-one', { input: { message: 'Synthetic candidate message' }, application: 'interview' });
  it('marks the created RUNNING record failed before propagating mandatory message failure', async () => {
    const failure = new Error('Synthetic required message unavailable'); trace.append.mockRejectedValue(failure);
    await expect(start()).rejects.toBe(failure);
    expect(prisma.run.updateMany).toHaveBeenCalledWith({ where: { id: run.id, status: 'RUNNING' }, data: {
      status: 'FAILED', completedAt: expect.any(Date), error: 'Application 初始化失败：必需消息持久化未确认',
    } });
    expect(trace.append).toHaveBeenCalledTimes(1);
    expect((service as any).writeTrace).not.toHaveBeenCalled();
  });
  it('preserves the primary error when failure-state persistence also fails', async () => {
    const failure = new Error('Synthetic mandatory failure'); trace.append.mockRejectedValue(failure);
    prisma.run.updateMany.mockRejectedValue(new Error('Synthetic database outage'));
    await expect(start()).rejects.toBe(failure);
    expect(prisma.run.updateMany).toHaveBeenCalledTimes(1);
    expect(trace.append).toHaveBeenCalledTimes(1);
  });
  it('does not overwrite a concurrently terminal record', async () => {
    const failure = new Error('Synthetic mandatory failure'); trace.append.mockRejectedValue(failure);
    prisma.run.updateMany.mockResolvedValue({ count: 0 });
    await expect(start()).rejects.toBe(failure);
    expect(prisma.run.updateMany.mock.calls[0][0].where).toEqual({ id: run.id, status: 'RUNNING' });
  });
  it('returns a valid initialized Run without failure-state writes', async () => {
    await expect(start()).resolves.toBe(run);
    expect(trace.append).toHaveBeenCalledWith(run.id, expect.objectContaining({ type: 'user.message' }));
    expect(prisma.run.updateMany).not.toHaveBeenCalled();
  });
});
