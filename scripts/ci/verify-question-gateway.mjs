import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(`${process.cwd()}/package.json`);
const { PrismaClient } = require('@prisma/client');
export async function verifyQuestionGateway({ request, admin, check }) {
  const prisma = new PrismaClient();
  const questionId = 'fixture-metered-question';
  try {
    const added = await request('/interview/question-bank', { method: 'POST', token: admin, body: { questionId, position: 'Fixture Metered', level: 'P5', category: 'Design', question: 'Explain a synthetic queue constraint', answer: 'Use a request key and a unique constraint.', tags: ['queue'] } });
    if (added.status !== 201 || added.data.success !== true) throw new Error(`Synthetic question add failed: ${JSON.stringify(added)}`);
    check('question creation uses actual Gateway embedding and confirms Milvus write', added.status === 201 && added.data.success === true);
    const listed = await request('/interview/question-bank/list?limit=50', { token: admin });
    check('question creation reads back through actual API', listed.data.results.some(item => item.questionId === questionId));
    const searched = await request('/interview/question-bank/search?q=queue&limit=5', { token: admin });
    check('semantic search and rerank return actual stored question', searched.status === 200 && searched.data.results.some(item => item.questionId === questionId && Number.isFinite(item.rerankScore)));
    const receipts = await prisma.usageLedger.findMany({ where: { userId: 'fixture-ci-admin', type: 'LLM_CALL' } });
    const auxiliary = receipts.filter(row => ['embedding', 'rerank'].includes(row.metadata?.task));
    check('embedding and rerank commit tenant usage and positive cost receipts', auxiliary.length === 3 && auxiliary.every(row => row.metadata.state === 'COMPLETED' && row.metadata.usage.promptTokens > 0 && row.metadata.estimatedCostCny > 0));
    check('model receipt stores no question or answer content', auxiliary.every(row => !JSON.stringify(row.metadata).includes('synthetic queue')));
    const user = await prisma.user.findUniqueOrThrow({ where: { id: 'fixture-ci-admin' }, include: { organization: { include: { plan: true } } } });
    const originalLimit = user.organization.plan.monthlyLlmCalls;
    await prisma.plan.update({ where: { id: user.organization.planId }, data: { monthlyLlmCalls: 0 } });
    try {
      const before = await fetch('http://127.0.0.1:3335/fixture/stats').then(r => r.json());
      const denied = await request('/interview/question-bank/search?q=queue&limit=5', { token: admin });
      const after = await fetch('http://127.0.0.1:3335/fixture/stats').then(r => r.json());
      check('exhausted quota rejects question search before any provider call', denied.status === 429 && before.embedding === after.embedding && before.rerank === after.rerank);
    } finally { await prisma.plan.update({ where: { id: user.organization.planId }, data: { monthlyLlmCalls: originalLimit } }); }
    const deleted = await request(`/interview/question-bank/${questionId}`, { method: 'DELETE', token: admin });
    check('question deletion confirms strong readback', deleted.status === 200 && deleted.data.deleted === true);
    const remaining = await request('/interview/question-bank/list?limit=50', { token: admin });
    assert.equal(remaining.data.results.some(item => item.questionId === questionId), false);
    check('deleted question stays absent in independent API read', true);
  } finally { await prisma.$disconnect(); }
}
