import { createRequire } from 'node:module';
import { executeQuestionTransfer } from './question-bank-transfer-executor.mjs';
import { milvusTransferAdapter } from './question-bank-transfer-milvus.mjs';
import { fixturePgHooks } from './question-transfer-fixture-pg.mjs';
const require = createRequire(`${process.cwd()}/package.json`);
const { MilvusClient } = require('@zilliz/milvus2-sdk-node');
if (process.env.LAB_FIXTURE_SYNTHETIC !== '1' || process.env.MILVUS_URL !== 'http://fixture-milvus:19530') throw Error('FIXTURE_WORKER_ONLY');
const auth = JSON.parse(process.argv[2]);
const client = new MilvusClient({ address: process.env.MILVUS_URL });
const hooks = fixturePgHooks();
const paced = { query: (...args) => client.query(...args), insert: (...args) => client.insert(...args), flush: async (...args) => { await new Promise(resolve => setTimeout(resolve, 11000)); return client.flush(...args); } };
const announced = { ...hooks, withTargetLock: async (target, work) => { process.send?.({ event: 'REQUEST_LOCK', operationId: auth.operationId }); return hooks.withTargetLock(target, work); } };
const deadline = setTimeout(() => process.exit(1), 120000);
try { const receipt = await executeQuestionTransfer(milvusTransferAdapter(paced, announced), auth); process.send?.({ event: 'DONE', receipt }); }
finally { clearTimeout(deadline); await client.closeConnection(); process.disconnect?.(); }
