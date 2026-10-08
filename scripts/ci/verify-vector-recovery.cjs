const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const product = createRequire(`${process.cwd()}/package.json`);
const { ConfigService } = product('@nestjs/config');
const { QuestionBankService } = product('./dist/modules/interview/services/question-bank.service');
const { tenantContext } = product('./dist/modules/organizations/tenant-context');
const qdrant = process.env.QDRANT_URL;
async function rpc(path, method = 'GET', body) {
  const response = await fetch(`${qdrant}${path}`, { method, signal: AbortSignal.timeout(10000),
    headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal(response.ok, true, `Qdrant ${method} ${path}`);
  return response.json();
}
async function main() {
  if (process.argv[2] === 'seed') {
    await rpc('/collections/recovery_fixture', 'PUT', { vectors: { size: 4, distance: 'Cosine' } });
    await rpc('/collections/recovery_fixture/points?wait=true', 'PUT', { points: [{ id: 1, vector: [1, 0, 0, 0], payload: { evidence: 'synthetic-recovery-fixture' } }] });
  }
  const points = await rpc('/collections/recovery_fixture/points/scroll', 'POST', { with_payload: true, with_vector: true, limit: 10 });
  assert.deepEqual(points.result.points, [{ id: 1, payload: { evidence: 'synthetic-recovery-fixture' }, vector: [1, 0, 0, 0] }]);
  const service = new QuestionBankService(new ConfigService({ milvus: { url: process.env.MILVUS_URL }, qwen: { apiKey: 'offline-fixture', baseUrl: 'http://127.0.0.1:1' } }), {});
  try {
    const questions = await tenantContext.run({ organizationId: 'fixture-question-store' }, () => service.list('Fixture'));
    assert.equal(questions.length, 1);
    assert.equal(questions[0].questionId, 'store-fixture-one');
    assert.equal(questions[0].answer, 'Synthetic answer');
    console.log(`PASS ${process.argv[2]}: actual Milvus question and Qdrant vector/payload`);
  } finally { await service.client.closeConnection(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
