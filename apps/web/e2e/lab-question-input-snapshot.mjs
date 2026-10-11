import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);
export async function questionInputSnapshot() {
  assert.equal(process.env.LAB_FIXTURE_SYNTHETIC, '1');
  const container = process.env.LAB_FIXTURE_API_CONTAINER;
  assert.match(container || '', /^interview-built-check-\d+-api$/);
  const script = `
    if (process.env.DATABASE_URL !== 'postgresql://postgres@fixture-pg:5432/fixture') throw Error('Private synthetic database required');
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    (async () => {
      try {
        const response = await fetch('http://127.0.0.1:3335/fixture/stats', { signal: AbortSignal.timeout(5000) });
        if (!response.ok) throw Error('Synthetic provider stats unavailable');
        const provider = await response.json();
        const ledger = await prisma.usageLedger.count({ where: { userId: 'fixture-ci-admin', type: 'LLM_CALL' } });
        console.log(JSON.stringify({ provider, ledger }));
      } finally { await prisma.$disconnect(); }
    })().catch(() => { console.error('Synthetic input snapshot failed'); process.exit(1); });`;
  const { stdout } = await execute('docker', ['exec', container, 'node', '-e', script], { timeout: 15000, maxBuffer: 4096 });
  const snapshot = JSON.parse(stdout);
  assert.equal(Number.isInteger(snapshot.ledger), true);
  for (const key of ['chat', 'embedding', 'rerank', 'externalRequests']) assert.equal(Number.isInteger(snapshot.provider[key]), true);
  assert.equal(snapshot.provider.externalRequests, 0);
  return snapshot;
}
