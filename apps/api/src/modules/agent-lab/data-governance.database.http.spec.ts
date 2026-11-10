import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AuthSessionService } from '../auth/auth-session.service';
import { TenantInterceptor } from '../organizations/tenant.interceptor';
import { tenantMiddleware } from '../organizations/tenant-policy';
import { DataGovernanceController } from './data-governance.controller';
import { DataGovernanceService } from './data-governance.service';
import { AgentRegistryController } from './agent-registry.controller';
import { AgentRegistryService } from './agent-registry.service';
import { ConfiguredRuntimeService } from './configured-runtime.service';
import { TraceEventService } from './trace-event.service';
jest.mock('../auth/auth-session.service', () => ({ AuthSessionService: class {} }));
jest.mock('../llm/llm.gateway.service', () => ({ LlmGatewayService: class {} }));
jest.mock('../llm/cost/llm-pricing-catalog.service', () => ({ LlmPricingCatalogService: class {} }));

const databaseUrl = process.env.TENANT_TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
suite('Data governance HTTP with signed fixture JWT and real PostgreSQL', () => {
  let app: INestApplication, raw: PrismaClient, scoped: PrismaClient, url: string;
  const key = `http-${randomUUID().slice(0, 8)}`;
  const org = `${key}-org`, foreignOrg = `${key}-foreign`;
  const owner = `${key}-owner`, reader = `${key}-reader`, stranger = `${key}-stranger`, foreign = `${key}-foreign`, user = `${key}-user`, unverified = `${key}-unverified`;
  const jwt = new JwtService({ secret: `isolated-test-${key}`, signOptions: { algorithm: 'HS256' } });
  const gateway = { chat: jest.fn(), getConfiguredModels: () => [] };
  // Session storage is substituted; signature/verified DB identity/RBAC/ALS/DTO/SQL are real.
  // The existing auth/browser acceptance covers the Redis session lifecycle separately.
  const sessions = { assertActive: jest.fn().mockResolvedValue(undefined) };
  let collection: any, record: any;
  async function request(actor: string | null, path = '', method = 'GET', body?: unknown) {
    const response = await fetch(`${url}/agent-lab/${path}`, { method, headers: {
      ...(actor ? { Authorization: `Bearer ${jwt.sign({ sub: actor, role: 'ADMIN', organizationId: foreignOrg })}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(5000) });
    return { status: response.status, body: await response.json() };
  }
  beforeAll(async () => {
    if (!databaseUrl?.includes('phase2_')) throw new Error('Only isolated phase2_ databases are authorized');
    raw = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    scoped = new PrismaClient({ datasources: { db: { url: databaseUrl } } }); scoped.$use(tenantMiddleware);
    for (const id of [org, foreignOrg]) await raw.organization.create({ data: { id, name: 'Synthetic HTTP organization' } });
    for (const id of [owner, reader, stranger, foreign, user, unverified]) await raw.user.create({ data: { id,
      email: `${id}@example.invalid`, organizationId: id === foreign ? foreignOrg : org,
      role: id === user ? 'USER' : 'ADMIN', emailVerifiedAt: id === unverified ? null : new Date() } });
    const service = new DataGovernanceService(scoped as any);
    const configured = new ConfiguredRuntimeService(scoped as any, gateway as any, {} as any, new TraceEventService(scoped as any), service);
    const module = await Test.createTestingModule({ controllers: [DataGovernanceController, AgentRegistryController], providers: [
      { provide: DataGovernanceService, useValue: service },
      { provide: AgentRegistryService, useValue: new AgentRegistryService(scoped as any, {} as any, configured) },
    ] }).compile();
    app = module.createNestApplication();
    app.useGlobalGuards(new JwtAuthGuard(jwt, { get: () => `isolated-test-${key}` } as unknown as ConfigService, new Reflector(), sessions as unknown as AuthSessionService, scoped as unknown as PrismaService), new RolesGuard(new Reflector()));
    app.useGlobalInterceptors(new TenantInterceptor());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1'); url = await app.getUrl();
  });
  afterAll(async () => { await app?.close(); await Promise.all([raw?.$disconnect(), scoped?.$disconnect()]); });
  beforeEach(async () => {
    collection = (await request(owner, 'data-collections', 'POST', { name: 'Private HTTP articles', kind: 'ARTICLE' })).body;
    expect(collection.access).toBe('OWNER');
    record = (await request(owner, `data-collections/${collection.id}/records`, 'POST', { title: 'ALPHA HTTP source', content: 'HTTP_PRIVATE_BODY' })).body;
    expect(record.revision).toBe(1); gateway.chat.mockClear();
  });
  it('requires authenticated verified database ADMIN identity, ignoring forged token role and tenant', async () => {
    expect((await request(null, 'data-collections')).status).toBe(401);
    expect((await request(user, 'data-collections')).status).toBe(403);
    expect((await request(unverified, 'data-collections')).status).toBe(401);
    const response = await fetch(`${url}/agent-lab/data-collections`, { headers: { Authorization: `Bearer ${jwt.sign({ sub: owner })}broken` } });
    expect(response.status).toBe(401);
    const list = await request(owner, 'data-collections');
    expect(list.status).toBe(200); expect(list.body.items.some((row: any) => row.id === collection.id)).toBe(true);
    expect(collection.organizationId).toBe(org);
  });
  it('denies same-org ADMIN and foreign guessing for content, history, writes and owner controls', async () => {
    const base = `data-collections/${collection.id}`;
    const before = await raw.labDataCollection.findUniqueOrThrow({ where: { id: collection.id } });
    for (const actor of [stranger, foreign]) {
      const list = await request(actor, 'data-collections');
      expect(list.body.items.some((row: any) => row.id === collection.id)).toBe(false);
      for (const path of [`${base}/records`, `${base}/records/${record.id}/history`, `${base}/grants`, `${base}/audit`]) {
        const result = await request(actor, path); expect(result.status).toBe(404); expect(JSON.stringify(result.body)).not.toContain(record.content);
      }
      expect((await request(actor, `${base}/records`, 'POST', { title: 'attack', content: 'attack' })).status).toBe(404);
      expect((await request(actor, base, 'DELETE')).status).toBe(404);
    }
    expect((await raw.labDataCollection.findUniqueOrThrow({ where: { id: collection.id } })).revision).toBe(before.revision);
  });
  it('enforces READ versus WRITE and owner-only delegation, then revokes content/history immediately', async () => {
    const base = `data-collections/${collection.id}`;
    expect((await request(owner, `${base}/grants`, 'PUT', { userId: reader, access: 'READ' })).status).toBe(200);
    expect((await request(reader, `${base}/records`)).body.items[0].id).toBe(record.id);
    expect((await request(reader, `${base}/records/${record.id}/history`)).body.items).toHaveLength(1);
    expect((await request(reader, `${base}/records`, 'POST', { title: 'no', content: 'no' })).status).toBe(404);
    expect((await request(reader, `${base}/grants`, 'PUT', { userId: stranger, access: 'WRITE' })).status).toBe(404);
    expect((await request(owner, `${base}/grants`, 'PUT', { userId: reader, access: 'WRITE' })).status).toBe(200);
    const edited = await request(reader, `${base}/records/${record.id}`, 'PUT', { title: record.title, content: 'Editor body', revision: 1 });
    expect(edited.status).toBe(200); expect(edited.body.revision).toBe(2);
    expect((await request(reader, `${base}/grants/${owner}`, 'DELETE')).status).toBe(404);
    expect((await request(reader, base, 'DELETE')).status).toBe(404);
    expect((await request(owner, `${base}/grants/${reader}`, 'DELETE')).body.revoked).toBe(true);
    for (const path of [`${base}/records`, `${base}/records/${record.id}/history`]) expect((await request(reader, path)).status).toBe(404);
    expect((await request(reader, `${base}/records/${record.id}`, 'PUT', { title: 'no', content: 'no', revision: 2 })).status).toBe(404);
    expect(gateway.chat).not.toHaveBeenCalled();
  });
  it('rejects forged ownership, unsupported types, unsafe source schemes and unbounded pagination', async () => {
    for (const body of [{ name: 'bad', kind: 'ARTICLE', organizationId: foreignOrg }, { name: 'bad', kind: 'ARTICLE', ownerId: reader }, { name: 'bad', kind: 'TABLE' }, { name: ' ', kind: 'ARTICLE' }]) {
      expect((await request(owner, 'data-collections', 'POST', body)).status).toBe(400);
    }
    for (const query of ['limit=51', 'page=0', 'page=1001', 'kind=TABLE', 'organizationId=forged']) expect((await request(owner, `data-collections?${query}`)).status).toBe(400);
    const path = `data-collections/${collection.id}/records`;
    for (const body of [{ title: 'x', content: 'x', sourceUrl: 'javascript:alert(1)' }, { title: 'x', content: 'x', collectionId: 'forged' }, { title: 'x', content: 'x'.repeat(20001) }]) expect((await request(owner, path, 'POST', body)).status).toBe(400);
    expect((await request(owner, `data-collections/${collection.id}/grants`, 'PUT', { userId: foreign, access: 'READ' })).status).toBe(404);
    expect((await raw.labDataRecord.findUniqueOrThrow({ where: { id: record.id } })).revision).toBe(1);
  });
  it('preserves history on conflict/delete/archive and keeps archive audit owner-only', async () => {
    const base = `data-collections/${collection.id}`;
    const value = { title: record.title, content: 'Updated content', revision: 1 };
    expect((await request(owner, `${base}/records/${record.id}`, 'PUT', value)).status).toBe(200);
    expect((await request(owner, `${base}/records/${record.id}`, 'PUT', value)).status).toBe(409);
    expect((await request(owner, `${base}/records/${record.id}?revision=1`, 'DELETE')).status).toBe(409);
    expect((await request(owner, `${base}/records/${record.id}?revision=2`, 'DELETE')).status).toBe(200);
    const history = await request(owner, `${base}/records/${record.id}/history`);
    expect(history.body.items.map((row: any) => row.revision)).toEqual([2, 1]);
    expect(history.body.items[1].snapshot.content).toBe(record.content);
    expect((await request(owner, base, 'DELETE')).body.archived).toBe(true);
    expect((await request(owner, `${base}/records`)).status).toBe(404);
    const audit = await request(owner, `${base}/audit`);
    expect(audit.body.items.some((row: any) => row.action === 'COLLECTION_ARCHIVE')).toBe(true);
    expect(JSON.stringify(audit.body)).not.toContain(record.content);
    expect((await request(stranger, `${base}/audit`)).status).toBe(404);
  });
  it('validates actual saved Agent bindings, clears clone bindings and refuses revoked/foreign collections', async () => {
    const agent = (await request(owner, 'agents', 'POST', { key: `${key}-bound`, name: 'HTTP bound Agent', type: 'CUSTOM' })).body;
    const definition = { version: '1.0.0', systemPrompt: 'Use permitted data', modelConfig: { provider: 'qwen', maxTokens: 64, temperature: 0 },
      runtimeConfig: { adapter: 'single-agent-v1', maxDurationMs: 1000, maxEstimatedCostCny: 0.05 }, knowledgeBindings: { collectionIds: [collection.id] } };
    const saved = await request(owner, `agents/${agent.id}/versions`, 'POST', definition);
    expect(saved.status).toBe(201); expect(saved.body.knowledgeBindings).toEqual(definition.knowledgeBindings);
    // Assigning the pointer only arranges a synthetic clone fixture, never bypasses publishing a product Agent.
    await raw.agent.update({ where: { id: agent.id }, data: { currentVersionId: saved.body.id } });
    const cloned = await request(owner, `agents/${agent.id}/clone`, 'POST', { key: `${key}-clone`, name: 'HTTP clone' });
    expect(cloned.status).toBe(201);
    const versions = await request(owner, `agents/${cloned.body.id}/versions`);
    expect(versions.body[0].knowledgeBindings).toEqual({});
    expect(versions.body[0].status).toBe('DRAFT');
    const denied = { ...definition, version: '1.0.1', knowledgeBindings: { collectionIds: ['not-authorized'] } };
    expect((await request(owner, `agents/${agent.id}/versions`, 'POST', denied)).status).toBe(404);
    expect((await request(stranger, `agents/${agent.id}/versions`, 'POST', definition)).status).toBe(404);
    expect((await raw.agentVersion.count({ where: { agentId: agent.id } }))).toBe(1);
    expect(gateway.chat).not.toHaveBeenCalled();
  });
});
