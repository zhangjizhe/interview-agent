import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';

assert.equal(process.env.GOLDEN_FIXTURE_SYNTHETIC, '1');
assert.equal(process.env.NODE_ENV, 'production');
assert.equal(process.env.DATABASE_URL, 'postgresql://postgres@fixture-pg:5432/fixture');
const base = 'http://127.0.0.1:3001/api';
const userId = `synthetic-presentation-${randomBytes(4).toString('hex')}`;
const password = 'isolated-presentation-fixture-password';
const product = createRequire(`${process.cwd()}/package.json`);
const { PrismaClient } = product('@prisma/client'); const prisma = new PrismaClient();
let token, primary;
const profile = async stage => {
  const response = await fetch('http://127.0.0.1:3335/fixture/golden-profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage }), signal: AbortSignal.timeout(3000) });
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { stage });
};
const request = async (path, body, expected = 200) => {
  const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, expected, `HTTP ${path}`); return response.json();
};
try {
  await profile('baseline');
  await request('/auth/register', { userId, password });
  const session = await request('/auth/login', { userId, password }); token = session.accessToken; assert.ok(token);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, organizationId: true } });
  const job = await request('/interview/target-jobs', { title: 'Synthetic Frontend Engineer', level: 'P5', jobDescription: 'React TypeScript frontend testing' }, 201);
  const form = new FormData();
  form.set('file', new Blob(['Synthetic Presentation Candidate\nReact TypeScript\nSynthetic frontend project'], { type: 'text/plain' }), 'synthetic-presentation.txt'); form.set('position', job.title);
  const uploaded = await fetch(`${base}/interview/upload-resume`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form, signal: AbortSignal.timeout(30000) });
  assert.equal(uploaded.status, 201); assert.equal((await uploaded.json()).ragIngested, true);
  // Only this synthetic fixture owner is promoted. Saved questions enter through
  // the real administrator API; preparation must consume them without embedding.
  await prisma.user.update({ where: { id: userId }, data: { role: 'ADMIN' } });
  token = (await request('/auth/login', { userId, password })).accessToken;
  const bankQuestionId = `synthetic-saved-${randomBytes(6).toString('hex')}`;
  const bankQuestion = 'Explain the saved synthetic frontend constraint and its verification.';
  const saved = await request('/interview/question-bank', { questionId: bankQuestionId, position: job.title, level: 'P5', category: 'frontend', question: bankQuestion, answer: 'Synthetic reference constraint', tags: ['synthetic'] }, 201);
  assert.equal(saved.success, true);
  const readStats = async () => {
    const result = await fetch('http://127.0.0.1:3335/fixture/stats', { signal: AbortSignal.timeout(5000) });
    assert.equal(result.status, 200); return result.json();
  };
  const statsBeforePreparation = await readStats();
  const ledgerBeforeStart = await prisma.usageLedger.count();
  const started = await request('/interview/start', { targetJobId: job.id, mode: 'FULL_SIMULATION' }, 201);
  const interviewId = started.interviewId; assert.ok(interviewId); assert.equal(started.interview.mode, 'FULL_SIMULATION');
  const startLedger = await prisma.usageLedger.findMany({ where: { interviewId } });
  assert.equal(startLedger.length, 1); assert.equal(startLedger[0].type, 'INTERVIEW_START');
  const ledgerBeforePreparation = await prisma.usageLedger.count();
  assert.equal(ledgerBeforePreparation, ledgerBeforeStart + 1);
  assert.equal((await request(`/interview/${interviewId}/confirm-resume`, {}, 201)).success, true);
  const snapshot = async () => {
    const interview = await prisma.interview.findUniqueOrThrow({ where: { id: interviewId } });
    assert.equal(interview.userId, user.id); assert.equal(interview.organizationId, user.organizationId);
    const [messages, tasks, questions, answers, history, evidence] = await Promise.all([
      prisma.message.findMany({ where: { interviewId } }), prisma.interviewTask.findMany({ where: { interviewId } }),
      prisma.interviewQuestion.findMany({ where: { interviewId } }), prisma.interviewAnswer.findMany({ where: { interviewId } }),
      prisma.answerHistory.findMany({ where: { interviewId } }), prisma.assessmentEvidence.findMany({ where: { interviewId } }),
    ]);
    for (const rows of [messages, tasks, questions, answers, history, evidence]) for (const row of rows) assert.equal(row.organizationId, user.organizationId);
    return { interview, messages, tasks, questions, answers, history, evidence };
  };
  const before = await snapshot();
  const assistant = before.messages.filter(row => row.role === 'assistant');
  const pending = before.tasks.filter(row => row.status === 'PENDING');
  assert.equal(pending.length, 1);
  assert.equal(pending[0].question, bankQuestion);
  const source = typeof pending[0].context === 'string' ? JSON.parse(pending[0].context) : pending[0].context;
  assert.equal(source.questionId, bankQuestionId); assert.equal(source.questionSelectionSource, 'stored-category-level/v1');
  const current = await request(`/interview/${interviewId}`);
  assert.equal(current.questionProtocol, 'presentation/v1');
  assert.equal(current.currentQuestion.question, bankQuestion);
  // A generic greeting is not evidence that the actual task question was shown.
  const presented = pending.some(task => typeof task.question === 'string' && task.question.trim().length > 0 && assistant.some(message => message.content.includes(task.question)));
  const clientMessageId = `presentation-${randomBytes(8).toString('hex')}`;
  const response = await fetch(`${base}/interview/${interviewId}/message`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ operation: 'OPEN', content: '开始面试', clientMessageId }), signal: AbortSignal.timeout(60000) });
  const text = await response.text();
  const frames = text.split('\n\n').filter(line => line.startsWith('data: ')).map(line => line.slice(6));
  const after = await snapshot();
  assert.deepEqual(await readStats(), statsBeforePreparation, 'confirm/GET/OPEN must add no provider work');
  assert.equal(await prisma.usageLedger.count(), ledgerBeforePreparation);
  const greeting = after.messages.find(row => row.clientMessageId === clientMessageId);
  const beforeCompleted = before.tasks.filter(row => row.status === 'COMPLETED').length;
  const afterCompleted = after.tasks.filter(row => row.status === 'COMPLETED').length;
  const facts = {
    syntheticQuestionPresentationProbe: true, userId,
    confirmed: before.interview.resumeConfirmed,
    before: { assistantMessages: assistant.length, pendingTasks: pending.length, normalizedQuestions: before.questions.length, actualTaskPresented: presented, answers: before.answers.length, scoredHistory: before.history.length, evidence: before.evidence.length, completedTasks: beforeCompleted },
    greeting: { httpStatus: response.status, completedSse: frames.at(-1) === '[DONE]', errorFrame: frames.some(frame => frame !== '[DONE]' && frame.includes('"type":"error"')), persisted: Boolean(greeting) },
    after: { answers: after.answers.length, scoredHistory: after.history.length, evidence: after.evidence.length, completedTasks: afterCompleted, greetingLinkedAnswers: greeting ? after.answers.filter(row => row.messageId === greeting.id).length : 0 },
  };
  console.log(JSON.stringify(facts));
  const failures = [];
  if (before.interview.resumeConfirmed !== true) failures.push('successful confirmation must persist resumeConfirmed before presentation checks');
  if (!presented) failures.push('confirmation must persist an assistant presentation of the actual pending task before asking for an answer');
  if (frames.at(-1) !== '[DONE]' || frames.some(frame => frame !== '[DONE]' && frame.includes('"type":"error"'))) failures.push('OPEN must complete without an error frame');
  if (greeting) failures.push('OPEN must not persist a candidate answer message');
  if (response.status !== 200) failures.push('greeting transport must retain the candidate SSE contract');
  if (after.answers.length !== before.answers.length || after.history.length !== before.history.length || after.evidence.length !== before.evidence.length) failures.push('a start greeting must not create normalized answers, scored history or formal evidence');
  if (afterCompleted !== beforeCompleted) failures.push('a start greeting must not complete an unanswered task');
  assert.deepEqual(failures, [], 'FIRST_QUESTION_PRESENTATION_CONTRACT');
  console.log('PASS actual first-question presentation and unscored start greeting; synthetic engineering fixture only, not model quality');
} catch (error) { primary = error; throw error; }
finally {
  const errors = [];
  try { await profile(null); } catch (error) { errors.push(error); }
  try { await prisma.$disconnect(); } catch (error) { errors.push(error); }
  if (errors.length) throw new AggregateError([...(primary ? [primary] : []), ...errors], 'Presentation probe fixture cleanup failed');
}
