import { test } from 'node:test';
import assert from 'node:assert/strict';
import { milvusTransferAdapter } from './question-bank-transfer-milvus.mjs';
const target='question_bank_v2_'+'a'.repeat(32),status={error_code:'Success',code:0};
const hooks={withTargetLock:async(_,work)=>work(),recordReceipt:async()=>{}};
test('Strong bounded query returns only confirmed data',async()=>{let params;const a=milvusTransferAdapter({query:async p=>{params=p;return{status,data:[]}}},hooks);assert.deepEqual(await a.readStrong(target),[]);assert.equal(params.consistency_level,0);assert.equal(params.limit,1001);});
test('false empty and contradictory statuses reject',async()=>{for(const r of [{status},{data:[]},{status:{error_code:'UnexpectedError',code:0},data:[]},{status:{error_code:'Success',code:7},data:[]}]){const a=milvusTransferAdapter({query:async()=>r},hooks);await assert.rejects(a.readStrong(target));}});
test('oversized read refuses rather than truncate',async()=>{const a=milvusTransferAdapter({query:async()=>({status,data:Array(1001).fill({})})},hooks);await assert.rejects(a.readStrong(target),/OVERSIZED/);});
test('source writes and arbitrary collection names rejected before SDK',async()=>{const a=milvusTransferAdapter({},hooks);await assert.rejects(a.insertConfirmed('question_bank_v2',[{}]),/SOURCE_WRITE/);await assert.rejects(a.readStrong('another-tenant'),/COLLECTION_INVALID/);await assert.rejects(a.flushConfirmed('question_bank_v2'),/SOURCE_WRITE/);});
test('insert requires full count and safe PKs without retry',async()=>{for(const r of [{status,insert_cnt:0,IDs:{int_id:{data:['1']}}},{status,insert_cnt:1,IDs:{int_id:{data:[]}}},{status,insert_cnt:1,IDs:{int_id:{data:[Number.MAX_SAFE_INTEGER+1]}}}]){let n=0;const a=milvusTransferAdapter({insert:async()=>{n++;return r}},hooks);await assert.rejects(a.insertConfirmed(target,[{}]),/UNCONFIRMED/);assert.equal(n,1);}});
test('confirmed insert and flush acknowledgement accepted',async()=>{const a=milvusTransferAdapter({insert:async()=>({status,insert_cnt:1,IDs:{int_id:{data:['9223372036854775806']}}}),flush:async()=>({status})},hooks);assert.equal(await a.insertConfirmed(target,[{}]),1);await a.flushConfirmed(target);});
test('lock and receipt sink cannot be omitted',()=>assert.throws(()=>milvusTransferAdapter({},{}),/CONTRACT_REQUIRED/));

test('sparse primary-key acknowledgement cannot confirm inserted rows', async () => {
  const a = milvusTransferAdapter({ insert: async () => ({ status, insert_cnt: 1, IDs: { int_id: { data: Array(1) } } }) }, hooks);
  await assert.rejects(a.insertConfirmed(target, [{}]), /UNCONFIRMED/);
});
test('duplicate primary keys cannot confirm two distinct inserted records', async () => {
  const a = milvusTransferAdapter({ insert: async () => ({ status, insert_cnt: 2, IDs: { int_id: { data: ['1', '1'] } } }) }, hooks);
  await assert.rejects(a.insertConfirmed(target, [{}, {}]), /UNCONFIRMED/);
});
test('out-of-int64 primary key strings cannot be valid Milvus IDs', async () => {
  const a = milvusTransferAdapter({ insert: async () => ({ status, insert_cnt: 1, IDs: { int_id: { data: ['9223372036854775808'] } } }) }, hooks);
  await assert.rejects(a.insertConfirmed(target, [{}]), /UNCONFIRMED/);
});
