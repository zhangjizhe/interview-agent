import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

test('legacy retention previews exact IDs, requires matching plan/snapshot, and never targets other collections', async () => {
  const deleted = []; let snapshot = false; let ids = [1, 2];
  const server = createServer(async (req, res) => {
    assert.ok(req.url.startsWith('/collections/semantic_cache/'));
    let body = ''; for await (const chunk of req) body += chunk;
    const input = body ? JSON.parse(body) : {};
    let result;
    if (req.url.includes('/snapshots')) result = snapshot ? [{ name: 'fixture.snapshot' }] : [];
    else if (req.url.includes('/points/delete')) { deleted.push(...input.points); ids = ids.filter(id => !input.points.includes(id)); result = { status: 'completed' }; }
    else result = { points: ids.map(id => ({ id })), next_page_offset: null };
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ status: 'ok', result }));
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  async function run(args = []) {
    const child = spawn(process.execPath, ['scripts/cache-legacy-retention.mjs', '--before=2000-01-01', ...args], { env: { ...process.env, QDRANT_MAINTENANCE_URL: `http://127.0.0.1:${server.address().port}`, QDRANT_API_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; let err = ''; child.stdout.on('data', value => { out += value; }); child.stderr.on('data', value => { err += value; });
    const code = await new Promise(done => child.on('close', done)); return { code, out, err };
  }
  try {
    const preview = await run(); assert.equal(preview.code, 0); const plan = JSON.parse(preview.out); assert.equal(plan.pointCount, 2); assert.deepEqual(deleted, []);
    assert.equal((await run(['--confirm-plan=wrong', '--snapshot=fixture.snapshot'])).code, 1);
    assert.equal((await run([`--confirm-plan=${plan.planHash}`, '--snapshot=fixture.snapshot'])).code, 1);
    assert.deepEqual(deleted, []);
    snapshot = true;
    const executed = await run([`--confirm-plan=${plan.planHash}`, '--snapshot=fixture.snapshot']); assert.equal(executed.code, 0); assert.deepEqual(deleted, [1, 2]);
    assert.equal(JSON.parse(executed.out).mode, 'deleted');
  } finally { await new Promise(done => server.close(done)); }
});
