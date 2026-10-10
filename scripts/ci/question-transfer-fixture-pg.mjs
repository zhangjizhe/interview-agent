import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
const require = createRequire(`${process.cwd()}/package.json`);
const { Client } = require('pg');
const scope = new AsyncLocalStorage();
function guard() {
  if (process.env.LAB_FIXTURE_SYNTHETIC !== '1' || process.env.FIXTURE_PG_URL !== 'postgresql://postgres@fixture-pg:5432/fixture_transfer') throw Error('FIXTURE_PG_ONLY');
}
export const targetLockKey = target => createHash('sha256').update(target).digest().readBigInt64BE(0).toString();
export async function connectFixturePg() {
  guard(); const client = new Client({ connectionString: process.env.FIXTURE_PG_URL, connectionTimeoutMillis: 5000, query_timeout: 50000 });
  client.on('error', () => { client.fixtureLost = true; });
  try { await client.connect(); } catch (error) { await client.end().catch(() => {}); throw error; }
  return client;
}
export async function initializeFixtureReceipts() {
  const client = await connectFixturePg();
  try { await client.query('CREATE TABLE IF NOT EXISTS fixture_transfer_receipts (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(), metadata jsonb NOT NULL)'); }
  finally { await client.end(); }
}
export async function readFixtureReceipts() {
  const client = await connectFixturePg();
  try { return (await client.query('SELECT metadata FROM fixture_transfer_receipts ORDER BY id')).rows.map(row => row.metadata); }
  finally { await client.end(); }
}
export function fixturePgHooks() {
  guard();
  return {
    async withTargetLock(target, work) {
      const client = await connectFixturePg(); let locked = false;
      try {
        await client.query("SET lock_timeout = '45s'"); await client.query("SET statement_timeout = '45s'");
        await client.query('SELECT pg_advisory_lock($1::bigint)', [targetLockKey(target)]); locked = true;
        if (client.fixtureLost) throw Error('FIXTURE_LOCK_CONNECTION_LOST');
        const result = await scope.run({ client }, work);
        if (client.fixtureLost) throw Error('FIXTURE_LOCK_CONNECTION_LOST');
        return result;
      } finally {
        if (locked && !client.fixtureLost) await client.query('SELECT pg_advisory_unlock($1::bigint)', [targetLockKey(target)]).catch(() => {});
        await client.end().catch(() => {});
      }
    },
    async recordReceipt(receipt) {
      const allowed = ['operationId', 'approvedBy', 'approvalId', 'source', 'target', 'sourceFingerprint', 'insertCount', 'skipCount', 'outcome'];
      if (Object.keys(receipt).some(key => !allowed.includes(key)) || !['PREPARED', 'WRITE_UNKNOWN', 'VERIFY_UNKNOWN', 'VERIFIED'].includes(receipt.outcome)) throw Error('FIXTURE_RECEIPT_METADATA_ONLY');
      const lock = scope.getStore(); if (!lock || lock.client.fixtureLost) throw Error('FIXTURE_LOCK_CONNECTION_LOST');
      await lock.client.query('SELECT 1');
      const client = await connectFixturePg();
      try { await client.query('INSERT INTO fixture_transfer_receipts(metadata) VALUES ($1::jsonb)', [JSON.stringify(receipt)]); }
      finally { await client.end(); }
    },
  };
}
