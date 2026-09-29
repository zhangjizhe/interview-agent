import { PrismaClient } from '@prisma/client';
import { tenantMiddleware } from './tenant-policy';
import { DEFAULT_ORGANIZATION_ID, tenantContext } from './tenant-context';
import { requireOwnedInterview } from '../../common/ownership.util';

// 只接受明确指定的隔离验收库，绝不复用应用 DATABASE_URL。
const databaseUrl = process.env.TENANT_TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
suite('真实 PostgreSQL 组织隔离', () => {
  let raw: PrismaClient;
  let scoped: PrismaClient;
  const prefix = `fixture-${Date.now()}`;
  const a = `${prefix}-a`, b = `${prefix}-b`;
  let interviewA: any, interviewB: any, workspaceB: any, agentB: any;
  const inA = (fn: () => any) => tenantContext.run({ organizationId: a, userId: a }, async () => await fn());
  const inB = (fn: () => any) => tenantContext.run({ organizationId: b, userId: b }, async () => await fn());
  beforeAll(async () => {
    if (!databaseUrl?.includes('phase2_')) throw new Error('Only phase2_ fixture databases are allowed');
    raw = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    scoped = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    scoped.$use(tenantMiddleware);
    for (const id of [a, b]) {
      await raw.organization.create({ data: { id, name: '合成验收组织' } });
      await raw.user.create({ data: { id, email: `${id}@example.invalid`, organizationId: id } });
    }
    interviewA = await inA(() => scoped.interview.create({ data: { userId: a, position: 'fixture' } }));
    interviewB = await inB(() => scoped.interview.create({ data: { userId: b, position: 'fixture' } }));
    workspaceB = await inB(() => scoped.workspace.create({ data: { slug: b, name: b, ownerId: b, members: { create: { userId: b } } }, include: { members: true } }));
    agentB = await inB(() => scoped.agent.create({ data: { workspaceId: workspaceB.id, key: 'fixture', name: 'fixture', type: 'test' } }));
  });
  afterAll(async () => { await Promise.all([raw?.$disconnect(), scoped?.$disconnect()]); });
  it('存量回填到默认组织，原数据保留', async () => {
    const old = await raw.interview.findUnique({ where: { id: 'legacy-interview' } });
    expect(old?.organizationId).toBe(DEFAULT_ORGANIZATION_ID);
    expect(old?.userId).toBe('legacy-fixture');
  });
  it('findUnique 不返回另一组织的数据', async () => {
    expect(await inA(() => scoped.interview.findUnique({ where: { id: interviewB.id } }))).toBeNull();
  });
  it('沿用 ownership 的跨组织 404', async () => {
    await expect(inA(() => requireOwnedInterview(scoped as any, interviewB.id, b))).rejects.toMatchObject({ status: 404 });
  });
  it('批量修改和删除不能影响另一组织', async () => {
    expect(await inA(() => scoped.interview.updateMany({ where: { id: interviewB.id }, data: { position: 'attack' } }))).toEqual({ count: 0 });
    expect(await inA(() => scoped.interview.deleteMany({ where: { id: interviewB.id } }))).toEqual({ count: 0 });
  });
  it('嵌套成员继承组织，Agent 查询隔离', async () => {
    expect(workspaceB.members[0].organizationId).toBe(b);
    expect(await inA(() => scoped.agent.findUnique({ where: { id: agentB.id } }))).toBeNull();
  });
  it('数据库拒绝跨组织引用，即使绕过应用 middleware', async () => {
    await expect(raw.agent.create({ data: { workspaceId: workspaceB.id, organizationId: a, key: 'attack', name: 'attack', type: 'test' } })).rejects.toMatchObject({ code: 'P2003' });
  });
  it('有历史数据的用户不能通过改组织带走资源', async () => {
    await expect(raw.user.update({ where: { id: a }, data: { organizationId: b } })).rejects.toMatchObject({ code: 'P2003' });
  });
  it('自己的组织资源正常查询', async () => {
    expect(await inA(() => scoped.interview.findMany())).toEqual([interviewA]);
  });
  it('跨组织单项修改返回 404', async () => {
    await expect(inA(() => scoped.agent.update({ where: { id: agentB.id }, data: { name: 'attack' } }))).rejects.toMatchObject({ status: 404 });
  });
  it('缺少请求或后台上下文时拒绝数据访问', async () => {
    await expect(scoped.interview.findMany()).rejects.toMatchObject({ status: 503 });
  });
});
