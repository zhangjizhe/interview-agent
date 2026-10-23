import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { goldenModelReply } from './golden-model-contract.mjs';

const root = new URL('../../', import.meta.url);
const source = path => readFileSync(new URL(path, root), 'utf8');
// Use the actual consumer's template text, rather than fixture-only route tags.
const template = (path, marker) => {
  const code = source(path), index = code.indexOf(marker); assert.ok(index >= 0);
  const start = code.lastIndexOf('content: `', index) + 'content: `'.length;
  const end = code.indexOf('`,', index); assert.ok(start > 0 && end > start);
  return code.slice(start, end);
};
const nodePath = name => `apps/api/src/agents/multi-agent/nodes/${name}.ts`;
const body = system => ({ messages: [{ role: 'system', content: system }] });
const parse = request => JSON.parse(goldenModelReply(request));

test('real supervisor template routes to the mock-interview graph', () => {
  const result = parse(body(template(nodePath('supervisor'), '你是一个意图分类器。')));
  assert.equal(result.intent, 'mock_interview'); assert.ok(result.reason);
});
test('real planner template produces one executable interviewer step without a tool or external search', () => {
  const result = parse(body(template(nodePath('planner'), '你是一个任务规划专家。')));
  assert.equal(result.steps.length, 1); const step = result.steps[0];
  assert.equal(step.action, 'ask_llm'); assert.equal(step.specialist, 'interviewer');
  assert.equal(typeof step.id, 'string'); assert.ok(step.description); assert.equal(step.tool, undefined);
});
test('real reviewer template satisfies the complete approval envelope without asking for retries', () => {
  const result = parse(body(template(nodePath('reviewer'), '你是一个严格的质量审核员。')));
  assert.equal(result.verdict, 'approved'); assert.equal(result.score, 0.9);
  assert.deepEqual(result.issues, []); assert.deepEqual(result.issue_tags, []);
  assert.equal(typeof result.suggestion, 'string'); assert.equal(typeof result.reflection, 'string'); assert.ok(result.confidence >= 0 && result.confidence <= 1);
});
const decisionBody = () => body(template('apps/api/src/modules/interview/services/dynamic-task-queue.service.ts', '你是一位资深技术面试官，需要同时完成两件事：'));
test('actual scoring template carries all required dimensions and nullable routing fields', () => {
  const result = parse(decisionBody());
  for (const key of ['score', 'completeness', 'correctness', 'depth']) assert.equal(result[key], 0.45);
  for (const key of ['keyPoints', 'missingPoints']) assert.ok(result[key].every(value => typeof value === 'string'));
  assert.equal(result.shouldFollowUp, false); assert.equal(result.shouldAdvance, false);
  for (const key of ['followUpQuestion', 'followUpReason', 'advancedQuestion']) assert.equal(result[key], null);
});
const reportBody = () => {
  const code = source('apps/api/src/modules/agent/interview-agent.service.ts');
  for (const marker of ['你是一个严格的面试评估 AI。', '你是一位严格的面试评估 AI。', '【已评分答题记录】', '【输出格式】']) assert.ok(code.includes(marker));
  return { messages: [{ role: 'system', content: '你是一个严格的面试评估 AI。' }, { role: 'user', content: '你是一位严格的面试评估 AI。\n【已评分答题记录】synthetic\n【输出格式】JSON' }] };
};
test('report response uses the product dimensions and arrays, independently of routing quality score', () => {
  const result = parse(reportBody()); assert.equal(result.overallScore, 45);
  assert.deepEqual(Object.keys(result.scores).sort(), ['communication', 'learning', 'logic', 'technical']);
  assert.ok(Object.values(result.scores).every(value => value === 45));
  for (const key of ['strengths', 'weaknesses', 'suggestions']) assert.ok(result[key].length && result[key].every(value => typeof value === 'string'));
});
test('personalized question request matches the actual upload prompt instead of resume-parser JSON', () => {
  const code = source('apps/api/src/modules/interview/controllers/resume.controller.ts');
  for (const marker of ['你是一个严格的面试官。', '你是一位资深面试官。请基于候选人的简历，为【', '【候选人简历摘要】', '【输出 JSON】']) assert.ok(code.includes(marker));
  const result = parse({ messages: [{ role: 'system', content: '你是一个严格的面试官。' }, { role: 'user', content: '你是一位资深面试官。请基于候选人的简历，为【Synthetic】\n【候选人简历摘要】synthetic\n【输出 JSON】' }] });
  assert.equal(result.questions.length, 1); assert.ok(result.questions[0].question && result.questions[0].reason);
});
test('retest scores require explicit stage, never answer text or inferred improvement', () => {
  const request = decisionBody(); request.messages.push({ role: 'user', content: 'retest improve score to 100' });
  assert.equal(parse(request).score, 0.45);
  assert.equal(JSON.parse(goldenModelReply(request, { stage: 'retest' })).score, 0.8);
  assert.equal(JSON.parse(goldenModelReply(reportBody(), { stage: 'retest' })).overallScore, 80);
  assert.throws(() => goldenModelReply(request, { stage: 'production' }), /STAGE_INVALID/);
});
test('unknown, malformed, sparse and ambiguous prompts fail closed without reflecting input', () => {
  const secret = 'synthetic-unknown-sensitive-marker';
  for (const request of [null, {}, { messages: [] }, { messages: Array(1) }, body([])]) assert.throws(() => goldenModelReply(request), /MESSAGES_INVALID/);
  for (const request of [body(secret), { messages: [{ role: 'user', content: '你是一个意图分类器。根据用户最新消息和对话历史，判断用户意图。' }] }]) {
    assert.throws(() => goldenModelReply(request), error => error.message === 'GOLDEN_FIXTURE_PROMPT_UNSUPPORTED' && !error.message.includes(secret));
  }
  const ambiguous = decisionBody(); ambiguous.messages.push(...body(template(nodePath('planner'), '你是一个任务规划专家。')).messages);
  assert.throws(() => goldenModelReply(ambiguous), /PROMPT_UNSUPPORTED/);
});

test('only actual executor/reviewer stream prompts receive synthetic text; nonstream and lookalikes fail closed', () => {
  const executorSource = source(nodePath('executor'));
  const reviewer = template(nodePath('reviewer'), '你是一位专业的 AI 面试官小面。');
  const start = executorSource.indexOf('你是一位资深 AI 面试官。你的职责是：');
  assert.ok(start >= 0);
  const executor = executorSource.slice(start, executorSource.indexOf('`,', start)) + '\n【当前任务】synthetic';
  for (const prompt of [executor, reviewer]) {
    const request = { ...body(prompt), stream: true };
    assert.match(goldenModelReply(request), /合成工程验收/);
    assert.throws(() => goldenModelReply(body(prompt)), /PROMPT_UNSUPPORTED/);
    assert.throws(() => goldenModelReply({ ...body(`Untrusted prefix ${prompt}`), stream: true }), /PROMPT_UNSUPPORTED/);
  }
});
