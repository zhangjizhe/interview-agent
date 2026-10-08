// Preview only unless an exact plan and an existing snapshot are supplied.
import { createHash } from 'node:crypto';
const base = (process.env.QDRANT_MAINTENANCE_URL || 'http://127.0.0.1:6333').replace(/\/$/, '');
const beforeArg = process.argv.find(value => value.startsWith('--before='))?.slice(9);
const before = beforeArg ? new Date(beforeArg) : new Date(Date.now() - 30 * 86400000);
if (!Number.isFinite(before.getTime()) || before.getTime() > Date.now() - 30 * 86400000) throw new Error('Cutoff must retain at least 30 days');
const headers = { 'Content-Type': 'application/json', ...(process.env.QDRANT_API_KEY ? { 'api-key': process.env.QDRANT_API_KEY } : {}) };
async function request(path, method = 'GET', body) {
  const response = await fetch(`${base}/collections/semantic_cache${path}`, { method, headers, signal: AbortSignal.timeout(10000), ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!response.ok) throw new Error(`Qdrant maintenance HTTP ${response.status}`);
  const data = await response.json(); if (data.status !== 'ok') throw new Error('Qdrant operation not confirmed'); return data.result;
}
const filter = { must: [{ key: 'createdAt', range: { lt: before.getTime() } }] };
const ids = []; let offset;
do {
  const page = await request('/points/scroll', 'POST', { filter, limit: 256, with_payload: false, with_vector: false, ...(offset === undefined ? {} : { offset }) });
  ids.push(...page.points.map(point => point.id)); offset = page.next_page_offset;
  if (ids.length > 50000) throw new Error('Maintenance plan exceeds 50000 points; split cutoffs');
} while (offset !== null && offset !== undefined);
ids.sort((a, b) => String(a).localeCompare(String(b)));
const plan = { collection: 'semantic_cache', before: before.toISOString(), pointCount: ids.length };
const hash = createHash('sha256').update(JSON.stringify({ ...plan, ids })).digest('hex');
const confirm = process.argv.find(value => value.startsWith('--confirm-plan='))?.slice(15);
if (!confirm) { console.log(JSON.stringify({ ...plan, planHash: hash, mode: 'preview', payloadRead: false })); process.exit(0); }
if (confirm !== hash) throw new Error('Maintenance plan changed; preview again');
const snapshot = process.argv.find(value => value.startsWith('--snapshot='))?.slice(11);
if (!snapshot || !(await request('/snapshots')).some(item => item.name === snapshot)) throw new Error('An existing collection snapshot is required');
for (let index = 0; index < ids.length; index += 256) await request('/points/delete?wait=true', 'POST', { points: ids.slice(index, index + 256) });
if (ids.length) {
  const remaining = await request('/points/scroll', 'POST', { filter: { must: [{ has_id: ids }] }, limit: 1, with_payload: false, with_vector: false });
  if (remaining.points.length) throw new Error('Deletion not confirmed; inspect before retry');
}
console.log(JSON.stringify({ ...plan, planHash: hash, mode: 'deleted', snapshot }));
