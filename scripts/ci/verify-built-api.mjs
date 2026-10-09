import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// Isolated synthetic fixtures. Configured runs use a deterministic localhost provider; no external models.
const base = process.env.API_BASE_URL || 'http://127.0.0.1:3001/api';
let passed = 0;
async function request(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method, signal: AbortSignal.timeout(5000),
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  return { status: response.status, data };
}
function check(name, condition) { assert.ok(condition, name); passed += 1; console.log(`PASS ${name}`); }
async function login(userId, role) {
  const password = 'isolated-fixture-password';
  const registered = await request('/auth/register', { method: 'POST', body: { userId, password } });
  assert.equal(registered.status, 200, 'fixture registration');
  const session = await request('/auth/login', { method: 'POST', body: { userId, password } });
  check(`${role} session is issued with expected role`, session.status === 200 && session.data.role === role && typeof session.data.accessToken === 'string');
  return session.data.accessToken;
}
check('liveness', (await request('/health')).status === 200);
check('readiness includes migrated database and Redis', (await request('/health/ready')).status === 200);
check('anonymous business access denied', (await request('/interview/list')).status === 401);
const owner = await login('fixture-ci-owner', 'USER');
const foreign = await login('fixture-ci-foreign', 'USER');
const admin = await login('fixture-ci-admin', 'ADMIN');
const sibling = await request('/auth/login', { method: 'POST', body: { userId: 'fixture-ci-owner', password: 'isolated-fixture-password' } });
check('parallel session login', sibling.status === 200);
const created = await request('/interview/target-jobs', { method: 'POST', token: owner, body: { title: 'Synthetic CI Role', level: 'P5' } });
check('owned target job creation', created.status === 201 && created.data.isActive === true && created.data.profileVersion === 1);
const jobs = await request('/interview/target-jobs', { token: owner });
check('owned target job persistence', jobs.status === 200 && jobs.data.some(job => job.id === created.data.id));
const foreignRead = await request(`/interview/target-jobs/${created.data.id}/readiness`, { token: foreign });
check('foreign target job access denied', [403, 404].includes(foreignRead.status));
check('USER question governance denied', (await request('/interview/question-bank/list', { token: owner })).status === 403);
check('ADMIN Lab registry access', (await request('/agent-lab/agents', { token: admin })).status === 200);
check('first ADMIN dashboard initializes dataset', (await request('/agent-lab/dashboard', { token: admin })).status === 200);
check('USER dashboard denied', (await request('/agent-lab/dashboard', { token: foreign })).status === 403);
const fixtureRequire = createRequire(`${process.cwd()}/package.json`);
const { PrismaClient } = fixtureRequire('@prisma/client');
const fixturePrisma = new PrismaClient();
try {
  await fixturePrisma.user.update({ where: { id: 'fixture-ci-foreign' }, data: { role: 'ADMIN' } });
  const promoted = await request('/auth/login', { method: 'POST', body: { userId: 'fixture-ci-foreign', password: 'isolated-fixture-password' } });
  check('promoted USER re-login issues ADMIN session', promoted.status === 200 && promoted.data.role === 'ADMIN');
  const dashboards = await Promise.all(Array.from({ length: 2 }, () => request('/agent-lab/dashboard', { token: promoted.data.accessToken })));
  const original = await request('/agent-lab/dashboard', { token: admin });
  check('second organization concurrent first dashboard succeeds', dashboards.every(r => r.status === 200));
  check('dataset same version is isolated by organization', dashboards[0].data.dataset.version === original.data.dataset.version && dashboards[0].data.dataset.id !== original.data.dataset.id && dashboards[0].data.dataset.id === dashboards[1].data.dataset.id);
  for (const path of ['/admin/mcp-servers', '/agent-lab/recorded-imports']) {
    check(`promoted ADMIN initial control plane ${path}`, (await request(path, { token: promoted.data.accessToken })).status === 200);
  }
  await fixturePrisma.user.update({ where: { id: 'fixture-ci-foreign' }, data: { role: 'USER' } });
  check('revoked ADMIN existing session denied', (await request('/agent-lab/dashboard', { token: promoted.data.accessToken })).status === 403);
} finally { await fixturePrisma.$disconnect(); }
check('evaluation request contract rejected before model work', (await request('/agent-lab/agents/fixture/evaluations', { method: 'POST', token: admin, body: {} })).status === 400);
check('empty question batch rejected before embedding', (await request('/interview/question-bank/batch', { method: 'POST', token: admin, body: { questions: [] } })).status === 400);
check('unbounded question query rejected before vector work', (await request('/interview/question-bank/list?limit=100000', { token: admin })).status === 400);
const questionList = await request('/interview/question-bank/list?limit=50', { token: admin });
check('initial unfiltered question list reaches real Milvus', questionList.status === 200 && Array.isArray(questionList.data.results));
const initialMcp = await request('/admin/mcp-servers', { token: admin });
const builtin = initialMcp.data.servers.find(server => server.name === 'knowledge_bank');
check('MCP builtin has a real execution binding', builtin?.executable === true);
check('MCP system shutdown accepted', (await request('/admin/mcp-servers/toggle', { method: 'POST', token: admin, body: { toolName: 'knowledge_bank', enabled: false } })).status === 201);
const disabledHealth = await request('/admin/mcp-servers/knowledge_bank/health', { token: admin });
check('disabled MCP health is not success', disabledHealth.status === 200 && disabledHealth.data.ok === false);
const reloadedMcp = await request('/admin/mcp-servers/reload', { method: 'POST', token: admin });
check('actual deployed MCP config reload succeeds without errors', reloadedMcp.status === 201 && reloadedMcp.data.ok === true && reloadedMcp.data.errors.length === 0);
const afterReload = await request('/admin/mcp-servers', { token: admin });
const reloadedBuiltin = afterReload.data.servers.find(server => server.name === 'knowledge_bank');
check('real HTTP reload retains shutdown and binding', reloadedBuiltin?.enabled === false && reloadedBuiltin?.executable === true);
check('MCP count reflects enabled execution bindings', afterReload.data.runningCount === afterReload.data.servers.filter(server => server.enabled && server.executable).length);
await request('/admin/mcp-servers/toggle', { method: 'POST', token: admin, body: { toolName: 'knowledge_bank', enabled: true } });
await (await import('/tmp/verify-configured-runtime.mjs')).verifyConfigured({ request, admin, owner, check });
await (await import('/tmp/verify-question-gateway.mjs')).verifyQuestionGateway({ request, admin, check });
await (await import('/tmp/verify-configured-release.mjs')).verifyConfiguredRelease({ request, admin, check });
check('server logout acknowledged', (await request('/auth/logout', { method: 'POST', token: sibling.data.accessToken })).status === 200);
check('logged out access token rejected', (await request('/auth/profile', { token: sibling.data.accessToken })).status === 401);
check('logged out refresh token rejected', (await request('/auth/refresh', { method: 'POST', body: { refreshToken: sibling.data.refreshToken } })).status === 401);
check('other device remains authenticated', (await request('/auth/profile', { token: owner })).status === 200);
const require = createRequire(`${process.cwd()}/package.json`);
await require('/tmp/verify-training-loop.cjs')({ request, owner, targetJobId: created.data.id, check });
await require('/tmp/verify-question-store.cjs')({ check });
console.log(`Built API smoke: ${passed}/${passed} passed (synthetic local provider, no external model work).`);
