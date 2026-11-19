jest.mock('../agent/multi-agent.service', () => ({ MultiAgentService: class {} }));
jest.mock('../../infra/prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('./trace-event.service', () => ({ TraceEventService: class {} }));
import { AgentRegistryService } from './agent-registry.service';
import { AgentRuntimeService } from './agent-runtime.service';
const agent = { id: 'agent-one', workspaceId: 'workspace-one', organizationId: 'organization-one', status: 'ACTIVE', currentVersionId: 'version-one' };
function fixture() {
  const db: any = {
    workspace: { upsert: jest.fn().mockResolvedValue({ id: agent.workspaceId }) },
    agent: { findFirst: jest.fn().mockResolvedValue(agent), update: jest.fn(async ({ data }) => ({ ...agent, ...data })) },
    agentVersion: { findFirst: jest.fn().mockResolvedValue({ id: 'version-one', agentId: agent.id, status: 'PUBLISHED' }) },
    decisionRecord: { create: jest.fn().mockResolvedValue({ id: 'decision-one' }) },
    run: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([{ id: 'historical-run', status: 'COMPLETED' }]) },
  };
  db.$transaction = jest.fn(async callback => callback(db));
  return db;
}
it('archives through an owned workspace and records the lifecycle decision in the same transaction without deleting history', async () => {
  const db = fixture();
  const service = new AgentRegistryService(db, {} as any);
  const result = await service.archiveAgent('owner', agent.id);
  expect(result).toMatchObject({ status: 'ARCHIVED', currentVersionId: 'version-one' });
  expect(db.agent.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: agent.id, workspaceId: agent.workspaceId } }));
  expect(db.decisionRecord.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ domain: 'AGENT_LAB', decisionType: 'AGENT_LIFECYCLE', actorId: 'owner', agentId: agent.id, outcome: { status: 'ARCHIVED' } }) }));
  expect(db.$transaction).toHaveBeenCalledTimes(1);
  expect(db.run.create).not.toHaveBeenCalled();
});
it('does not archive another workspace or change a current pointer when ownership is denied', async () => {
  const db = fixture(); db.agent.findFirst.mockResolvedValue(null);
  await expect(new AgentRegistryService(db, {} as any).archiveAgent('stranger', agent.id)).rejects.toMatchObject({ status: 404 });
  expect(db.agent.update).not.toHaveBeenCalled(); expect(db.decisionRecord.create).not.toHaveBeenCalled();
});
it('restores only a published version and logs the lifecycle action without bypassing draft publication', async () => {
  const db = fixture(); const service = new AgentRegistryService(db, {} as any);
  await service.activateVersion('owner', agent.id, 'version-one');
  expect(db.agent.update).toHaveBeenCalledWith({ where: { id: agent.id }, data: { status: 'ACTIVE', currentVersionId: 'version-one' } });
  db.agentVersion.findFirst.mockResolvedValue({ id: 'draft-one', status: 'DRAFT' });
  db.agent.update.mockClear();
  await expect(service.activateVersion('owner', agent.id, 'draft-one')).rejects.toMatchObject({ status: 409 });
  expect(db.agent.update).not.toHaveBeenCalled();
});
it.each(['prepare', 'direct', 'external'])('blocks archived Agent %s entry before preparing or creating a Run', async entry => {
  const db = fixture(); db.agent.findFirst.mockResolvedValue({ ...agent, status: 'ARCHIVED' });
  const configured = { prepare: jest.fn() };
  const service = new AgentRuntimeService(db, {} as any, {} as any, {} as any, configured as any);
  const dto = { input: { message: 'must not execute' }, agentVersionId: 'version-one' };
  const action = entry === 'prepare' ? service.prepareConfiguredRun('owner', agent.id, dto, true) : entry === 'direct' ? service.runAgent('owner', agent.id, dto) : service.startExternalRun('owner', agent.id, dto);
  await expect(action).rejects.toMatchObject({ status: 409 });
  expect(configured.prepare).not.toHaveBeenCalled(); expect(db.run.create).not.toHaveBeenCalled();
});
it('retains read access to historical Runs for an archived owned Agent', async () => {
  const db = fixture(); db.agent.findFirst.mockResolvedValue({ ...agent, status: 'ARCHIVED' });
  const service = new AgentRuntimeService(db, {} as any, {} as any, {} as any);
  await expect(service.listRuns('owner', agent.id)).resolves.toEqual([{ id: 'historical-run', status: 'COMPLETED' }]);
});
