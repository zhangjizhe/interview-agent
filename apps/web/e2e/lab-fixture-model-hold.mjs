import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);
export async function fixtureModelHold(mode) {
  assert.equal(process.env.LAB_FIXTURE_SYNTHETIC, '1');
  assert.ok(['state', 'release'].includes(mode));
  const container = process.env.LAB_FIXTURE_API_CONTAINER;
  assert.match(container || '', /^interview-built-check-\d+-api$/);
  const script = `
    if (process.env.DATABASE_URL !== 'postgresql://postgres@fixture-pg:5432/fixture') throw Error('Private fixture required');
    fetch('http://127.0.0.1:3335/fixture/${mode === 'state' ? 'hold-state' : 'release'}', { method: '${mode === 'state' ? 'GET' : 'POST'}', signal: AbortSignal.timeout(5000) })
      .then(async response => { if (!response.ok) throw Error('Fixture hold unavailable'); console.log(JSON.stringify(await response.json())); })
      .catch(() => { console.error('Fixture hold failed'); process.exit(1); });`;
  const { stdout } = await execute('docker', ['exec', container, 'node', '-e', script], { timeout: 10000, maxBuffer: 2048 });
  return JSON.parse(stdout);
}
