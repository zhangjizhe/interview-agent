import { createHash } from 'node:crypto';
import { planQuestionTransfer } from './question-bank-transfer-plan.mjs';
const fields = ['questionId', 'position', 'level', 'category', 'question', 'answer', 'tags', 'createdAt', 'text', 'vector'];

// Operator-only adapter contract. Identity/model provenance and approval are
// resolved by the trusted caller, never supplied by a public HTTP request.
// Adapter reads must be complete/bounded Strong reads; writes must return a
// confirmed row count. No retries, deletions or embedding calls are performed.
export async function executeQuestionTransfer(adapter, authorization) {
  const { organizationId, approvedOrganizationId, approvedSourceFingerprint, sourceEmbeddingRevision, targetEmbeddingRevision } = authorization;
  if (!organizationId || organizationId === 'default-organization' || approvedOrganizationId !== organizationId
    || !/^[a-f0-9]{64}$/.test(approvedSourceFingerprint || '')
    || ['operationId', 'approvedBy', 'approvalId'].some(field => typeof authorization[field] !== 'string' || !authorization[field].trim() || authorization[field].length > 128)
    || !sourceEmbeddingRevision || sourceEmbeddingRevision !== targetEmbeddingRevision) throw new Error('TRANSFER_AUTHORIZATION_REQUIRED');
  const source = 'question_bank_v2';
  const target = `question_bank_v2_${createHash('sha256').update(organizationId).digest('hex').slice(0, 32)}`;
  if (typeof adapter.withTargetLock !== 'function') throw new Error('TRANSFER_LOCK_REQUIRED');
  return adapter.withTargetLock(target, async () => {
  const sourceRows = structuredClone(await adapter.readStrong(source));
  const targetRows = structuredClone(await adapter.readStrong(target));
  const plan = planQuestionTransfer(sourceRows, targetRows);
  if (plan.sourceFingerprint !== approvedSourceFingerprint) throw new Error('TRANSFER_SOURCE_CHANGED');
  const receipt = { operationId: authorization.operationId, approvedBy: authorization.approvedBy, approvalId: authorization.approvalId, source, target, sourceFingerprint: plan.sourceFingerprint, insertCount: plan.insert.length, skipCount: plan.skip.length };
  const pendingIds = new Set(plan.insert.map(entry => entry.questionId));
  const expectedFingerprint = planQuestionTransfer([...targetRows, ...sourceRows.filter(row => pendingIds.has(row.questionId))], []).sourceFingerprint;
  await adapter.recordReceipt({ ...receipt, outcome: 'PREPARED' });
  if (plan.insert.length) {
    const ids = new Set(plan.insert.map(entry => entry.questionId));
    const rows = sourceRows.filter(row => ids.has(row.questionId)).map(row => Object.fromEntries(fields.map(field => [field, field === 'vector' ? [...row.vector] : row[field]])));
    try {
      if (await adapter.insertConfirmed(target, rows) !== rows.length) throw new Error('TRANSFER_INSERT_INCOMPLETE');
      await adapter.flushConfirmed(target);
    } catch {
      await adapter.recordReceipt({ ...receipt, outcome: 'WRITE_UNKNOWN' });
      throw new Error('TRANSFER_WRITE_UNKNOWN_RECONCILE_REQUIRED');
    }
  }
  try {
    const after = planQuestionTransfer(await adapter.readStrong(target), []);
    const unchanged = planQuestionTransfer(await adapter.readStrong(source), []);
    if (after.sourceFingerprint !== expectedFingerprint || unchanged.sourceFingerprint !== plan.sourceFingerprint) throw new Error('TRANSFER_READBACK_MISMATCH');
    await adapter.recordReceipt({ ...receipt, outcome: 'VERIFIED' });
    return receipt;
  } catch {
    await adapter.recordReceipt({ ...receipt, outcome: 'VERIFY_UNKNOWN' });
    throw new Error('TRANSFER_VERIFY_UNKNOWN_RECONCILE_REQUIRED');
  }
  });
}
