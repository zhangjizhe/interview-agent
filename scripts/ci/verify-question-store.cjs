const { createRequire } = require('node:module');
const assert = require('node:assert/strict');
const product = createRequire(`${process.cwd()}/package.json`);
const { ConfigService } = product('@nestjs/config');
const { QuestionBankService } = product('./dist/modules/interview/services/question-bank.service');
const { tenantContext } = product('./dist/modules/organizations/tenant-context');
module.exports = async ({ check }) => {
  const service = new QuestionBankService(new ConfigService({ milvus: { url: process.env.MILVUS_URL }, qwen: { apiKey: 'offline-fixture', baseUrl: 'http://127.0.0.1:1' } }), {});
  // Explicitly synthetic embeddings; actual Milvus schema, insertion and flush.
  service.embedText = async () => [1, ...Array(1023).fill(0)];
  const scope = fn => tenantContext.run({ organizationId: 'fixture-question-store' }, fn);
  const fixture = { questionId: 'store-fixture-one', position: 'Fixture', level: 'P5', category: 'Design', question: 'Explain a constraint', answer: 'Synthetic answer', tags: '' };
  try {
    await scope(() => service.addQuestions([fixture]));
    check('actual Milvus insert/IDs/flush contract', (await scope(() => service.list('Fixture'))).some(item => item.questionId === fixture.questionId));
    const flush = service.flushConfirmed.bind(service); let interrupt = true;
    service.flushConfirmed = async () => { if (interrupt) { interrupt = false; throw new Error('synthetic post-insert outage'); } return flush(); };
    await assert.rejects(scope(() => service.addQuestions([{ ...fixture, questionId: 'store-rollback-fixture' }])), /QUESTION_WRITE_ROLLED_BACK/);
    const remaining = await scope(() => service.list('Fixture'));
    check('actual vector rollback deletes only newly inserted primary IDs', remaining.some(item => item.questionId === fixture.questionId) && !remaining.some(item => item.questionId === 'store-rollback-fixture'));
  } finally { await service.client.closeConnection(); }
};
