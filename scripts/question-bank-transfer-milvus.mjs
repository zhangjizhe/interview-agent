const fields = ['questionId','position','level','category','question','answer','tags','createdAt','text','vector'];
function validIds(ids) {
  if (!Array.isArray(ids)) return false;
  const canonical=[];
  for (const id of Array.from(ids)) {
    if ((typeof id !== 'string' && typeof id !== 'number') || (typeof id === 'number' && !Number.isSafeInteger(id))) return false;
    const text=String(id);
    if (!/^\d{1,19}$/.test(text)) return false;
    const value=BigInt(text);
    if (value > 9223372036854775807n) return false;
    canonical.push(value.toString());
  }
  return new Set(canonical).size === ids.length;
}
const validCollection = name => name === 'question_bank_v2' || /^question_bank_v2_[a-f0-9]{32}$/.test(name);
function confirmed(result) {
  const status=result?.status;
  if (!status || (status.error_code !== 'Success' && status.code !== 0)
    || (status.error_code !== undefined && status.error_code !== 'Success')
    || (status.code !== undefined && status.code !== 0)) throw new Error('TRANSFER_MILVUS_REJECTED');
}
function checkCollection(name) { if (!validCollection(name)) throw new Error('TRANSFER_COLLECTION_INVALID'); }

// SDK bridge only; trusted caller supplies a cross-process exclusive lock and
// durable receipt sink. Neither approval nor model provenance is inferred here.
export function milvusTransferAdapter(client, { withTargetLock, recordReceipt }) {
  if (typeof withTargetLock !== 'function' || typeof recordReceipt !== 'function') throw new Error('TRANSFER_ADAPTER_CONTRACT_REQUIRED');
  return { withTargetLock, recordReceipt,
    async readStrong(collection) {
      checkCollection(collection);
      const result=await client.query({collection_name:collection,filter:'',limit:1001,output_fields:fields,consistency_level:0,timeout:5000});
      confirmed(result);
      if (!Array.isArray(result.data) || result.data.length > 1000) throw new Error('TRANSFER_READ_INCOMPLETE_OR_OVERSIZED');
      return result.data;
    },
    async insertConfirmed(collection, rows) {
      checkCollection(collection);
      if (collection === 'question_bank_v2') throw new Error('TRANSFER_SOURCE_WRITE_FORBIDDEN');
      const result=await client.insert({collection_name:collection,data:rows,timeout:5000});
      confirmed(result);
      const ids=result.IDs?.int_id?.data;
      if (!Array.isArray(ids) || ids.length !== rows.length || Number(result.insert_cnt) !== rows.length
        || !validIds(ids)) throw new Error('TRANSFER_INSERT_UNCONFIRMED');
      return rows.length;
    },
    async flushConfirmed(collection) {
      checkCollection(collection);
      if(collection==='question_bank_v2')throw new Error('TRANSFER_SOURCE_WRITE_FORBIDDEN');
      confirmed(await client.flush({collection_names:[collection],timeout:5000}));
    },
  };
}
