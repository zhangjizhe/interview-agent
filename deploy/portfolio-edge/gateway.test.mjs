import test from 'node:test'; import assert from 'node:assert/strict';
import { createPortfolioGateway } from './gateway.mjs';
const origin = 'https://portfolio.example.test', key = 'synthetic-gateway-key-not-for-production-1234';
const body = { message: '介绍项目', requestKey: '3a889f51-05a7-40a2-baaa-41f14f59ed38' };
const req = (path = '/api/portfolio-assistant/chat', options = {}) => new Request('https://edge.example.test' + path, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Portfolio-Gateway-Key': key }, body: JSON.stringify(body), ...options });
const make = fetcher => createPortfolioGateway({ upstream: 'http://api:3001', publicOrigin: origin, secret: key, fetcher });
test('only portfolio chat and signed-answer reads are routable; control/auth/database paths never reach API', async () => {
  let calls = 0; const gateway = make(async () => { calls++; throw Error(); });
  for (const path of ['/api/auth/login', '/api/agent-lab/agents', '/api/health', '/api/portfolio-assistant/chat?x=1', '/api/portfolio-assistant/answers/not-a-ticket']) assert.equal((await gateway(req(path))).status, 404);
  assert.equal(calls, 0);
});
test('requires server-only credential and exact origin before any upstream call', async () => {
  let calls = 0; const gateway = make(async () => { calls++; throw Error(); });
  assert.equal((await gateway(req(undefined, { headers: { Origin: origin } }))).status, 401);
  assert.equal((await gateway(req(undefined, { headers: { Origin: 'https://wrong.test', 'X-Portfolio-Gateway-Key': key } }))).status, 403);
  assert.equal(calls, 0);
});
test('fixed destination strips visitor authentication, cookies, forged IPs and gateway key', async () => {
  let captured; const gateway = make(async (url, options) => { captured = { url, options };return new Response(JSON.stringify({ contractVersion: 'portfolio-assistant/v1', status: 'REFUSED', answer: '公开资料范围', sources: [] }), { headers: { 'Content-Type': 'application/json' } }); });
  const response = await gateway(req(undefined, { headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Portfolio-Gateway-Key': key, Authorization: 'Bearer visitor', Cookie: 'private=x', 'X-Forwarded-For': '10.0.0.1' } }));
  assert.equal(response.status, 200); assert.equal(captured.url, 'http://api:3001/api/portfolio-assistant/chat');
  assert.deepEqual(Object.keys(captured.options.headers).sort(), ['Content-Type', 'Origin']); assert.deepEqual(JSON.parse(captured.options.body), body);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
test('rejects authority overrides and oversized bodies before upstream', async () => {
  let calls = 0; const gateway = make(async () => { calls++; throw Error(); });
  assert.equal((await gateway(req(undefined, { body: JSON.stringify({ ...body, agentId: 'foreign' }) }))).status, 400);
  assert.equal((await gateway(req(undefined, { body: JSON.stringify({ ...body, message: 'a'.repeat(5000) }) }))).status, 400); assert.equal(calls, 0);
});
test('private backend fields, redirects and non-JSON responses never reach visitors', async () => {
  for (const data of [{ contractVersion: 'portfolio-assistant/v1', status: 'COMPLETED', runId: 'private-run' }, { secret: 'private' }]) {
    const gateway = make(async () => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } }));
    const response = await gateway(req()); assert.equal(response.status, 502); assert.doesNotMatch(await response.text(), /private/);
  }
  const gateway = make(async () => new Response('private stack', { status: 500 }));const response = await gateway(req());assert.equal(response.status, 502);assert.doesNotMatch(await response.text(), /private/);
});
test('signed ticket polling is passed unchanged without logging or administrative authority', async () => {
  const path = '/api/portfolio-assistant/answers/' + 'a'.repeat(48) + '.' + 'b'.repeat(43);let target;
  const gateway = make(async url => { target = url;return new Response(JSON.stringify({ contractVersion: 'portfolio-assistant/v1', status: 'PENDING', pollAfterMs: 1500 }), { headers: { 'Content-Type': 'application/json' } }); });
  assert.equal((await gateway(new Request('https://edge.example.test' + path, { headers: { Origin: origin, 'X-Portfolio-Gateway-Key': key } }))).status, 200); assert.equal(target, 'http://api:3001' + path);
});

test('real HTTP startup consumes its private key file and refuses management and anonymous calls', async () => {
  const { mkdtemp, writeFile, access, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os'); const { join } = await import('node:path');
  const { once } = await import('node:events'); const { startPortfolioGateway } = await import('./gateway.mjs');
  const dir = await mkdtemp(join(tmpdir(), 'portfolio-gateway-')), file = join(dir, 'secret');
  await writeFile(file, key, { mode: 0o600 }); let server;
  try {
    server = await startPortfolioGateway({ PORTFOLIO_GATEWAY_SECRET_FILE: file, PORTFOLIO_GATEWAY_PUBLIC_ORIGIN: origin, HOST: '127.0.0.1', PORT: '0' });
    if (!server.listening) await once(server, 'listening');
    await assert.rejects(access(file));
    const base = 'http://127.0.0.1:' + server.address().port;
    assert.equal((await fetch(base + '/api/auth/login')).status, 404);
    assert.equal((await fetch(base + '/api/portfolio-assistant/chat', { method: 'POST' })).status, 401);
    assert.equal((await fetch(base + '/api/portfolio-assistant/chat', { method: 'POST', headers: { 'X-Portfolio-Gateway-Key': key, Origin: 'https://other.test' } })).status, 403);
  } finally { if (server) await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true }); }
});
test('malformed private keys fail before listening', () => {
  for (const secret of ['x'.repeat(31), 'contains spaces'.repeat(4), 'x'.repeat(257)])
    assert.throws(() => createPortfolioGateway({ upstream: 'http://api:3001', publicOrigin: origin, secret }));
});
