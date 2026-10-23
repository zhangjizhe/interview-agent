import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

test('actual synthetic HTTP stream preserves default mode and cumulative work', { timeout: 10000 }, async () => {
  const child = spawn(process.execPath, ['scripts/ci/fixture-model-server.mjs'], { env: { ...process.env, FIXTURE_MODEL_PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let diagnostics = ''; child.stderr.on('data', data => { diagnostics += data; });
  try {
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Fixture did not start')), 5000);
      child.stdout.on('data', data => { const match = String(data).match(/synthetic-fixture-port:(\d+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
      child.once('exit', () => { clearTimeout(timer); reject(Error(diagnostics || 'Fixture exited')); });
    });
    const base = `http://127.0.0.1:${port}`;
    const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(2000) });
    const body = { model: 'synthetic', messages: [{ role: 'user', content: 'synthetic hello' }] };
    const normal = await (await post('/v1/chat/completions', body)).json();
    assert.equal(normal.choices[0].message.content, 'fixture-response:synthetic hello');
    const stream = await post('/v1/chat/completions', { ...body, stream: true });
    assert.match(stream.headers.get('content-type'), /text\/event-stream/);
    const frames = (await stream.text()).trim().split('\n\n').map(line => line.slice(6));
    assert.equal(frames.at(-1), '[DONE]');
    const data = frames.slice(0, -1).map(JSON.parse);
    assert.equal(data.filter(chunk => chunk.choices[0].delta.content).length, 2);
    assert.equal(data.map(chunk => chunk.choices[0].delta.content || '').join(''), normal.choices[0].message.content);
    assert.equal(data.at(-1).choices[0].finish_reason, 'stop');
    assert.deepEqual(data.at(-1).usage, { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 });
    assert.equal((await post('/fixture/golden-profile', { stage: 'unsafe' })).status, 400);
    assert.equal((await post('/fixture/golden-profile', { stage: 'baseline' })).status, 200);
    assert.equal((await post('/v1/chat/completions', body)).status, 422);
    assert.equal((await post('/fixture/golden-profile', { stage: null })).status, 200);
    assert.equal((await (await post('/v1/chat/completions', body)).json()).choices[0].message.content, normal.choices[0].message.content);
    assert.deepEqual(await (await fetch(base + '/fixture/stats')).json(), { chat: 4, embedding: 0, rerank: 0, externalRequests: 0 });
  } finally { child.kill('SIGTERM'); await once(child, 'exit'); }
});
