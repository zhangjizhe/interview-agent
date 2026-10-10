import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executeQuestionTransfer } from './question-bank-transfer-executor.mjs';
import { planQuestionTransfer } from './question-bank-transfer-plan.mjs';
const sourceRow = {questionId:'synthetic',position:'Synthetic',level:'P5',category:'general',question:'Question',answer:'Answer',tags:'',createdAt:'2026-10-10',text:'Question Answer',vector:Array(1024).fill(0.5),id:'source-only'};
function fixture() {
  const receipts=[], target=[], calls=[];
  let lockTail=Promise.resolve();
  const adapter={withTargetLock:async(_target, work)=>{const prior=lockTail;let release;lockTail=new Promise(resolve=>{release=resolve});await prior;try{return await work()}finally{release()}},readStrong:async name=>name==='question_bank_v2'?[sourceRow]:target, recordReceipt:async r=>receipts.push(r),insertConfirmed:async(name,rows)=>{calls.push(name);target.push(...rows);return rows.length},flushConfirmed:async()=>{}};
  const auth={operationId:'synthetic-operation',approvedBy:'synthetic-owner',approvalId:'synthetic-approval',organizationId:'synthetic-org',approvedOrganizationId:'synthetic-org',approvedSourceFingerprint:planQuestionTransfer([sourceRow],[]).sourceFingerprint,sourceEmbeddingRevision:'synthetic-v1-1024',targetEmbeddingRevision:'synthetic-v1-1024'};
  return {adapter,auth,receipts,target,calls};
}
test('copies only approved target, strips PK, retains source, retry skips',async()=>{const f=fixture();await executeQuestionTransfer(f.adapter,f.auth);assert.equal(f.target.length,1);assert.equal(f.target[0].id,undefined);assert.equal(sourceRow.id,'source-only');await executeQuestionTransfer(f.adapter,f.auth);assert.equal(f.calls.length,1);assert.equal(f.receipts.at(-1).outcome,'VERIFIED');});
test('missing/mismatched approval and unknown model reject before writes',async()=>{for(const patch of [{approvedOrganizationId:'other'},{approvedSourceFingerprint:''},{sourceEmbeddingRevision:''},{targetEmbeddingRevision:'other'},{organizationId:'default-organization'}]){const f=fixture();await assert.rejects(executeQuestionTransfer(f.adapter,{...f.auth,...patch}),/AUTHORIZATION/);assert.equal(f.calls.length,0);}});
test('source change invalidates approved plan',async()=>{const f=fixture();f.auth.approvedSourceFingerprint='a'.repeat(64);await assert.rejects(executeQuestionTransfer(f.adapter,f.auth),/SOURCE_CHANGED/);assert.equal(f.calls.length,0);});
test('receipt failure before insert prevents mutation',async()=>{const f=fixture();f.adapter.recordReceipt=async()=>{throw new Error('offline')};await assert.rejects(executeQuestionTransfer(f.adapter,f.auth));assert.equal(f.calls.length,0);});
test('unconfirmed insert stops without retry and records unknown',async()=>{const f=fixture();f.adapter.insertConfirmed=async()=>0;await assert.rejects(executeQuestionTransfer(f.adapter,f.auth),/WRITE_UNKNOWN/);assert.equal(f.receipts.at(-1).outcome,'WRITE_UNKNOWN');});
test('readback omission cannot report verified',async()=>{const f=fixture();f.adapter.insertConfirmed=async(_,rows)=>rows.length;await assert.rejects(executeQuestionTransfer(f.adapter,f.auth),/VERIFY_UNKNOWN/);assert.equal(f.receipts.at(-1).outcome,'VERIFY_UNKNOWN');});
test('conflicting destination refuses whole plan',async()=>{const f=fixture();f.target.push({...sourceRow,answer:'different'});await assert.rejects(executeQuestionTransfer(f.adapter,f.auth),/CONTENT_CONFLICT/);assert.equal(f.calls.length,0);});

test('flush failure records uncertain persistence and never repeats insert', async () => {
  const f = fixture(); let flushCalls = 0;
  f.adapter.flushConfirmed = async () => { flushCalls++; throw new Error('unconfirmed flush'); };
  await assert.rejects(executeQuestionTransfer(f.adapter, f.auth), /WRITE_UNKNOWN/);
  assert.equal(f.calls.length, 1); assert.equal(flushCalls, 1);
  assert.equal(f.receipts.at(-1).outcome, 'WRITE_UNKNOWN');
});
test('source mutation during write cannot produce a verified receipt', async () => {
  const f = fixture(); let sourceReads = 0;
  f.adapter.readStrong = async name => name === 'question_bank_v2'
    ? [{ ...sourceRow, ...(sourceReads++ ? { answer: 'changed after approval' } : {}) }]
    : f.target;
  await assert.rejects(executeQuestionTransfer(f.adapter, f.auth), /VERIFY_UNKNOWN/);
  assert.equal(f.receipts.some(r => r.outcome === 'VERIFIED'), false);
});
test('concurrent identical transfers must not insert duplicate business IDs', async () => {
  const f = fixture();
  f.adapter.readStrong = async name => {
    const snapshot = name === 'question_bank_v2' ? structuredClone([sourceRow]) : structuredClone(f.target);
    await new Promise(resolve => setImmediate(resolve));
    return snapshot;
  };
  await Promise.allSettled([executeQuestionTransfer(f.adapter, f.auth), executeQuestionTransfer(f.adapter, f.auth)]);
  assert.equal(f.target.filter(r => r.questionId === sourceRow.questionId).length, 1, 'concurrent plans need target exclusion or atomic insert uniqueness');
});
test('verification must preserve pre-existing target records as well as source copies', async () => {
  const f = fixture(); const existing = { ...sourceRow, questionId: 'pre-existing' };
  f.target.push(existing);
  f.adapter.insertConfirmed = async (_name, rows) => { f.calls.push('insert'); f.target.length = 0; f.target.push(...rows); return rows.length; };
  await assert.rejects(executeQuestionTransfer(f.adapter, f.auth), /VERIFY_UNKNOWN/);
  assert.equal(f.receipts.some(r => r.outcome === 'VERIFIED'), false);
});

test("missing exclusive lock rejects before mutation", async()=>{const f=fixture();delete f.adapter.withTargetLock;await assert.rejects(executeQuestionTransfer(f.adapter,f.auth),/LOCK_REQUIRED/);assert.equal(f.calls.length,0);});

test("approval receipt identity required",async()=>{for(const field of ["operationId","approvedBy","approvalId"]){const f=fixture();await assert.rejects(executeQuestionTransfer(f.adapter,{...f.auth,[field]:""}),/AUTHORIZATION/);assert.equal(f.calls.length,0);}});
