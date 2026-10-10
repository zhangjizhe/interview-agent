import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fixturePgHooks, initializeFixtureReceipts, readFixtureReceipts, connectFixturePg, targetLockKey } from './question-transfer-fixture-pg.mjs';
import { executeQuestionTransfer } from './question-bank-transfer-executor.mjs';
import { planQuestionTransfer } from './question-bank-transfer-plan.mjs';
import { milvusTransferAdapter } from './question-bank-transfer-milvus.mjs';
assert.equal(process.env.LAB_FIXTURE_SYNTHETIC, '1');
assert.equal(process.env.MILVUS_URL, 'http://fixture-milvus:19530');
const deadline = setTimeout(() => { console.error('Synthetic storage fixture deadline exceeded'); process.exit(1); }, 240000);
const require = createRequire(`${process.cwd()}/package.json`);
const { ConfigService } = require('@nestjs/config');
const { QuestionBankService } = require('./dist/modules/interview/services/question-bank.service');
const { tenantContext } = require('./dist/modules/organizations/tenant-context');
const { MilvusClient } = require('@zilliz/milvus2-sdk-node');
const client = new MilvusClient({ address: process.env.MILVUS_URL });
const service = new QuestionBankService(new ConfigService({ milvus: { url: process.env.MILVUS_URL } }), {
  embedText: () => { throw Error('Model call forbidden'); }, rerank: () => { throw Error('Model call forbidden'); },
});
const collection = org => org === 'default-organization' ? 'question_bank_v2' : `question_bank_v2_${createHash('sha256').update(org).digest('hex').slice(0, 32)}`;
const row = id => ({ questionId: id, position: 'Synthetic', level: 'P5', category: 'synthetic', question: `合成题 ${id}`, answer: '合成答案', tags: 'fixture', text: `合成题 ${id}\n\n合成答案\n\nfixture`, createdAt: '2026-10-10T00:00:00Z', vector: Array(1024).fill(0.5) });
const receipts = []; let inserts = 0;
// Isolated PG fixture: session locks and autocommit receipt rows, no production wiring.
const pgHooks = fixturePgHooks();
const hooks = { ...pgHooks, recordReceipt: async receipt => { await pgHooks.recordReceipt(receipt); receipts.push(structuredClone(receipt)); } };
// Milvus default flush limit is 0.1/s: pace each fixture request, never retry it.
const pacedClient = { query: (...args) => client.query(...args), insert: (...args) => client.insert(...args),
  flush: async (...args) => { await new Promise(resolve => setTimeout(resolve, 11000)); return client.flush(...args); } };
const sdk = milvusTransferAdapter(pacedClient, hooks);
const seed = async (name, rows) => {
  const result = await client.insert({ collection_name: name, data: rows, timeout: 5000 });
  assert.equal(result.status.error_code, 'Success'); assert.equal(Number(result.insert_cnt), rows.length);
  await sdk.flushConfirmed(name);
};
try {
  await initializeFixtureReceipts();
  for (const organizationId of ['default-organization', 'synthetic-transfer-a', 'synthetic-transfer-b', 'synthetic-transfer-unknown', 'synthetic-transfer-conflict', 'synthetic-transfer-concurrent']) {
    await tenantContext.run({ organizationId }, () => service.ensureCollection());
  }
  // Seeding synthetic source is fixture setup, never executor source mutation.
  const source = collection('default-organization');
  const sourceInsert = await client.insert({ collection_name: source, data: [row('source-1'), row('source-2')], timeout: 5000 });
  assert.equal(sourceInsert.status.error_code, 'Success'); assert.equal(Number(sourceInsert.insert_cnt), 2);
  const sourceFlush = await client.flush({ collection_names: [source], timeout: 5000 });
  assert.equal(sourceFlush.status.error_code, 'Success');
  await seed(collection('synthetic-transfer-a'), [row('a-existing')]);
  await seed(collection('synthetic-transfer-b'), [row('b-private')]);
  await seed(collection('synthetic-transfer-conflict'), [{ ...row('source-1'), answer: 'conflicting synthetic answer', text: 'conflicting synthetic text' }]);
  const beforeSource = await sdk.readStrong(source), beforeB = await sdk.readStrong(collection('synthetic-transfer-b'));
  const fingerprint = rows => planQuestionTransfer(rows, []).sourceFingerprint;
  const authorization = org => ({ organizationId: org, approvedOrganizationId: org, approvedSourceFingerprint: fingerprint(beforeSource), sourceEmbeddingRevision: 'synthetic-constant-1024/v1', targetEmbeddingRevision: 'synthetic-constant-1024/v1', operationId: `fixture-${org}`, approvedBy: 'synthetic-operator', approvalId: 'synthetic-approval' });
  const tracked = { ...sdk, insertConfirmed: async (...args) => { inserts++; return sdk.insertConfirmed(...args); } };
  for (const patch of [{ approvedOrganizationId: 'different-org' }, { targetEmbeddingRevision: 'different-model' }, { approvedSourceFingerprint: '0'.repeat(64) }]) {
    const baselineInserts = inserts, baselineReceipts = receipts.length;
    await assert.rejects(executeQuestionTransfer(tracked, { ...authorization('synthetic-transfer-a'), ...patch }), /AUTHORIZATION_REQUIRED|SOURCE_CHANGED/);
    assert.equal(inserts, baselineInserts); assert.equal(receipts.length, baselineReceipts);
  }
  await assert.rejects(executeQuestionTransfer({ ...tracked, recordReceipt: async () => { throw Error('Synthetic PREPARED sink unavailable'); } }, authorization('synthetic-transfer-a')), /PREPARED sink unavailable/);
  assert.equal(inserts, 0); assert.equal(receipts.length, 0);
  const conflictBefore = fingerprint(await sdk.readStrong(collection('synthetic-transfer-conflict')));
  await assert.rejects(executeQuestionTransfer(tracked, authorization('synthetic-transfer-conflict')), /CONTENT_CONFLICT/);
  assert.equal(inserts, 0); assert.equal(receipts.length, 0);
  assert.equal(fingerprint(await sdk.readStrong(collection('synthetic-transfer-conflict'))), conflictBefore);
  console.log('PASS trusted authorization mismatch, changed approval fingerprint and real stored conflict refuse before insert');
  await executeQuestionTransfer(tracked, authorization('synthetic-transfer-a'));
  assert.equal(receipts.at(-1).outcome, 'VERIFIED'); assert.equal(inserts, 1);
  assert.equal(fingerprint(await sdk.readStrong(collection('synthetic-transfer-a'))), fingerprint([...beforeSource, row('a-existing')]));
  await executeQuestionTransfer(tracked, authorization('synthetic-transfer-a'));
  assert.equal(inserts, 1); assert.equal(receipts.at(-1).skipCount, 2);
  assert.equal(fingerprint(await sdk.readStrong(source)), fingerprint(beforeSource));
  assert.equal(fingerprint(await sdk.readStrong(collection('synthetic-transfer-b'))), fingerprint(beforeB));
  console.log('PASS actual SDK insert/flush/Strong full union, idempotence, unchanged source and separate organization B');
  let unknownInserts = 0;
  const uncertain = { ...sdk, insertConfirmed: async (...args) => { unknownInserts++; await sdk.insertConfirmed(...args); throw Error('Synthetic lost insert acknowledgement after real success'); } };
  await assert.rejects(executeQuestionTransfer(uncertain, authorization('synthetic-transfer-unknown')), /WRITE_UNKNOWN/);
  assert.equal(unknownInserts, 1); assert.equal(receipts.at(-1).outcome, 'WRITE_UNKNOWN');
  assert.equal(receipts.some(receipt => receipt.operationId === 'fixture-synthetic-transfer-unknown' && receipt.outcome === 'VERIFIED'), false);
  await sdk.flushConfirmed(collection('synthetic-transfer-unknown'));
  assert.equal(fingerprint(await sdk.readStrong(collection('synthetic-transfer-unknown'))), fingerprint(beforeSource));
  const reconciled = await executeQuestionTransfer(tracked, { ...authorization('synthetic-transfer-unknown'), operationId: 'fixture-reconciled' });
  assert.equal(reconciled.insertCount, 0); assert.equal(reconciled.skipCount, 2); assert.equal(inserts, 1);
  assert.equal(receipts.at(-1).outcome, 'VERIFIED');
  assert.equal(receipts.some(receipt => receipt.operationId === 'fixture-synthetic-transfer-unknown' && receipt.outcome === 'VERIFIED'), false);
  assert.equal(fingerprint(await sdk.readStrong(source)), fingerprint(beforeSource));
  assert.equal(fingerprint(await sdk.readStrong(collection('synthetic-transfer-b'))), fingerprint(beforeB));
  console.log('PASS actual insert with discarded ack is WRITE_UNKNOWN; explicit Strong reconciliation skips without another insert');
  const concurrentTarget = collection('synthetic-transfer-concurrent');
  const blocker = await connectFixturePg();
  const workers = [];
  try {
    await blocker.query('SELECT pg_advisory_lock($1::bigint)', [targetLockKey(concurrentTarget)]);
    const startWorker = operationId => {
      const worker = fork(fileURLToPath(new URL('./question-transfer-fixture-worker.mjs', import.meta.url)), [JSON.stringify({ ...authorization('synthetic-transfer-concurrent'), operationId })], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
      workers.push(worker);
      const requested = new Promise((resolve, reject) => { worker.on('message', message => { if (message.event === 'REQUEST_LOCK') resolve(); }); worker.once('error', reject); worker.once('exit', code => { if (code !== 0) reject(Error('Worker failed before lock')); }); });
      const done = new Promise((resolve, reject) => { let receipt; worker.on('message', message => { if (message.event === 'DONE') receipt = message.receipt; }); worker.once('error', reject); worker.once('exit', code => code === 0 && receipt ? resolve(receipt) : reject(Error('Worker failed'))); });
      done.catch(() => {});
      return { requested, done };
    };
    const first = startWorker('fixture-concurrent-1'), second = startWorker('fixture-concurrent-2');
    await Promise.all([first.requested, second.requested]);
    // Query actual PG waiters, not just IPC announcements or overlapping promises.
    let waiting = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      const result = await blocker.query('SELECT count(*)::int AS n FROM pg_locks WHERE locktype = $1 AND NOT granted', ['advisory']);
      if (result.rows[0].n === 2) { waiting = true; break; }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(waiting, true, 'two distinct processes must both wait on held target lock');
    await blocker.query('SELECT pg_advisory_unlock($1::bigint)', [targetLockKey(concurrentTarget)]);
    const results = await Promise.all([first.done, second.done]);
    assert.equal(results.reduce((sum, item) => sum + item.insertCount, 0), 2);
    assert.equal(results.reduce((sum, item) => sum + item.skipCount, 0), 2);
    assert.equal(fingerprint(await sdk.readStrong(concurrentTarget)), fingerprint(beforeSource));
  } finally { for (const worker of workers) if (worker.exitCode === null) worker.kill(); await blocker.end(); }
  // A fresh connection after worker exit proves receipts outlive Node process memory.
  const persisted = await readFixtureReceipts();
  for (const operationId of ['fixture-concurrent-1', 'fixture-concurrent-2']) {
    assert.deepEqual(persisted.filter(item => item.operationId === operationId).map(item => item.outcome), ['PREPARED', 'VERIFIED']);
  }
  assert.deepEqual(persisted.filter(item => item.operationId === 'fixture-synthetic-transfer-unknown').map(item => item.outcome), ['PREPARED', 'WRITE_UNKNOWN']);
  assert.deepEqual(persisted.filter(item => item.operationId === 'fixture-reconciled').map(item => item.outcome), ['PREPARED', 'VERIFIED']);
  assert.equal(persisted.some(item => ['question', 'answer', 'vector', 'text'].some(field => field in item)), false);
  assert.equal(fingerprint(await sdk.readStrong(source)), fingerprint(beforeSource));
  assert.equal(fingerprint(await sdk.readStrong(collection('synthetic-transfer-b'))), fingerprint(beforeB));
  console.log('PASS isolated PG: two independent workers concurrently blocked, serialized transfer, persistent metadata receipts after worker exit');
  console.log('LIMITED: fixture session lock/receipt only; no production ordinary-write coordination, lost-lock fencing, API tenant auth, real embedding provenance or business migration');
} finally {
  clearTimeout(deadline); await client.closeConnection(); await service.client.closeConnection();
}
