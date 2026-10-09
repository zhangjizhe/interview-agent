import { createHash } from 'node:crypto';

const fields = ['questionId', 'position', 'level', 'category', 'question', 'answer', 'tags', 'createdAt', 'text', 'vector'];
const limits = { questionId: 100, position: 100, level: 20, category: 100, question: 4000, answer: 8000, tags: 500, createdAt: 50, text: 8000 };
export function questionFingerprint(row) {
  for (const [field, limit] of Object.entries(limits)) {
    if (typeof row[field] !== 'string' || Buffer.byteLength(row[field], 'utf8') > limit) throw new Error('TRANSFER_INVALID_TEXT');
  }
  if (!row.questionId.trim() || !row.position.trim() || !row.question.trim() || !row.answer.trim()) throw new Error('TRANSFER_MISSING_REQUIRED');
  if (!Array.isArray(row.vector) || row.vector.length !== 1024 || Array.from(row.vector).some(value => typeof value !== 'number' || !Number.isFinite(value) || !Number.isFinite(Math.fround(value)))) throw new Error('TRANSFER_INVALID_VECTOR');
  const canonical = Object.fromEntries(fields.map(field => [field, row[field]]));
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

// Pure preview only. No client, credentials, network, embedding or writes.
export function planQuestionTransfer(source, target) {
  if (!Array.isArray(source) || !Array.isArray(target) || source.length > 1000 || target.length > 1000) throw new Error('TRANSFER_BOUNDS');
  const collect = rows => {
    const result = new Map();
    for (const row of rows) {
      const fingerprint = questionFingerprint(row);
      if (result.has(row.questionId)) throw new Error('TRANSFER_DUPLICATE_ID');
      result.set(row.questionId, fingerprint);
    }
    return result;
  };
  const origin = collect(source), destination = collect(target);
  const insert = [], skip = [];
  for (const [questionId, fingerprint] of origin) {
    if (!destination.has(questionId)) insert.push({ questionId, fingerprint });
    else if (destination.get(questionId) === fingerprint) skip.push({ questionId, fingerprint });
    else throw new Error('TRANSFER_CONTENT_CONFLICT');
  }
  const byId = (a, b) => a.questionId < b.questionId ? -1 : a.questionId > b.questionId ? 1 : 0;
  insert.sort(byId); skip.sort(byId);
  const entries = [...origin].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  return { sourceCount: source.length, targetCount: target.length, insert, skip,
    sourceFingerprint: createHash('sha256').update(JSON.stringify(entries)).digest('hex') };
}
