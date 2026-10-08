import assert from 'node:assert/strict';

// Isolated synthetic fixtures. Never call model, embedding or evaluation execution.
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
const created = await request('/interview/target-jobs', { method: 'POST', token: owner, body: { title: 'Synthetic CI Role', level: 'P5' } });
check('owned target job creation', created.status === 201 && created.data.isActive === true && created.data.profileVersion === 1);
const jobs = await request('/interview/target-jobs', { token: owner });
check('owned target job persistence', jobs.status === 200 && jobs.data.some(job => job.id === created.data.id));
const foreignRead = await request(`/interview/target-jobs/${created.data.id}/readiness`, { token: foreign });
check('foreign target job access denied', [403, 404].includes(foreignRead.status));
check('USER question governance denied', (await request('/interview/question-bank/list', { token: owner })).status === 403);
check('ADMIN Lab registry access', (await request('/agent-lab/agents', { token: admin })).status === 200);
check('evaluation request contract rejected before model work', (await request('/agent-lab/agents/fixture/evaluations', { method: 'POST', token: admin, body: {} })).status === 400);
console.log(`Built API smoke: ${passed}/${passed} passed (synthetic, no model work).`);
