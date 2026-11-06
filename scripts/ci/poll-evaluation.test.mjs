import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pollEvaluation } from './poll-evaluation.mjs';
function clock() { let time = 0; const waits = []; return { now: () => time, wait: async ms => { waits.push(ms); time += ms; }, waits }; }
test('rate limited GET waits and reads the existing job to completion', async () => {
 const timer = clock(), responses = [{ status: 429 }, { status: 200, data: { status: 'RUNNING' } }, { status: 200, data: { status: 'COMPLETED', id: 'existing' } }]; let reads = 0;
 assert.equal((await pollEvaluation(async () => responses[reads++], timer)).id, 'existing'); assert.equal(reads, 3); assert.deepEqual(timer.waits, [10000, 1000]);
});
test('repeated rate limits end at bounded deadline without another POST', async () => {
 const timer = clock(); let reads = 0;
 await assert.rejects(pollEvaluation(async () => { reads++; return { status: 429 }; }, { ...timer, timeoutMs: 15000 }), /not resubmitted/);
 assert.equal(reads, 2); assert.deepEqual(timer.waits, [10000, 5000]);
});
test('authentication failures, malformed states and actual failed evaluations are not hidden', async () => {
 await assert.rejects(pollEvaluation(async () => ({ status: 401 }), clock()), /HTTP 401/);
 await assert.rejects(pollEvaluation(async () => ({ status: 200, data: {} }), clock()), /Unknown/);
 assert.equal((await pollEvaluation(async () => ({ status: 200, data: { status: 'FAILED' } }), clock())).status, 'FAILED');
});
