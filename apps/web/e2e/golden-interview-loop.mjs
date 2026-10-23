import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

assert.equal(process.env.LAB_FIXTURE_SYNTHETIC, '1');
const container = process.env.LAB_FIXTURE_API_CONTAINER;
assert.match(container || '', /^interview-built-check-\d+-api$/);
const control = (mode, userId) => JSON.parse(execFileSync('docker', ['exec', '-e', 'GOLDEN_FIXTURE_SYNTHETIC=1', container, 'node', '/tmp/fixture-golden-inspect.cjs', mode, ...(userId ? [userId] : [])], { encoding: 'utf8', timeout: 20000 }));
const origin = 'http://localhost:5177';
const userId = `synthetic-golden-browser-${randomBytes(3).toString('hex')}`;
const password = 'isolated-golden-browser-password';
let browser, context, primary;
try {
  control('profile-baseline');
  browser = await chromium.launch({ headless: true }); context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(); const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const waitPost = (path, timeout = 60000) => {
    const promise = page.waitForResponse(r => r.url() === `${origin}/api${path}` && r.request().method() === 'POST', { timeout });
    promise.catch(() => undefined); return promise;
  };
  const postFromUI = async (path, action, expected = 201) => {
    const promise = waitPost(path); await action(); const response = await promise; assert.equal(response.status(), expected, path); return response.json();
  };
  const read = async path => {
    const token = await page.evaluate(() => localStorage.getItem('ia_access_token')); assert.ok(token);
    const response = await context.request.get(`${origin}/api${path}`, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 });
    assert.equal(response.status(), 200, path); return response.json();
  };
  const inspect = () => control('inspect', userId);
  const nav = name => page.getByRole('navigation', { name: '候选人导航', exact: true }).getByRole('link', { name, exact: true });
  const login = async () => {
    await page.getByLabel('用户名', { exact: true }).fill(userId); await page.getByLabel('密码', { exact: true }).fill(password);
    await postFromUI('/auth/login', () => page.getByRole('button', { name: '登录', exact: true }).click(), 200);
    await nav('岗位设置').waitFor();
  };
  await page.goto(origin);
  await page.getByRole('button', { name: '没有账号，创建账号', exact: true }).click();
  await page.getByLabel('用户名', { exact: true }).fill(userId); await page.getByLabel('密码', { exact: true }).fill(password);
  const registered = await postFromUI('/auth/register', () => page.getByRole('button', { name: '创建账号', exact: true }).click(), 200);
  assert.equal(registered.userId, userId); await page.getByRole('button', { name: '登录', exact: true }).waitFor(); await login();
  await nav('岗位设置').click(); await page.getByRole('heading', { name: '创建目标岗位', exact: true }).waitFor();
  const form = page.locator('form').filter({ has: page.getByRole('heading', { name: '创建目标岗位', exact: true }) });
  await form.getByPlaceholder('例如：前端开发工程师').fill('Synthetic Frontend Engineer');
  await form.getByPlaceholder('例如：P5').fill('P5');
  await form.getByPlaceholder('粘贴职位描述，系统将提取岗位相关技能要求。').fill('React TypeScript frontend testing');
  const job = await postFromUI('/interview/target-jobs', () => form.getByRole('button', { name: '保存岗位', exact: true }).click());
  assert.ok(job.id); assert.equal(job.profileVersion, 1);
  await page.getByRole('status').filter({ hasText: '岗位已创建并设为当前岗位' }).waitFor();
  await nav('首页').click(); await page.locator('input[type=file]').waitFor({ state: 'attached' });
  const uploaded = await postFromUI('/interview/upload-resume', () => page.locator('input[type=file]').setInputFiles({ name: 'synthetic-golden.txt', mimeType: 'text/plain', buffer: Buffer.from('Synthetic Golden Candidate\nReact TypeScript\nSynthetic frontend project') }));
  assert.equal(uploaded.ragIngested, true); await page.getByRole('status').filter({ hasText: '简历已更新' }).waitFor();
  await page.getByRole('complementary').getByRole('button', { name: '开始模拟面试', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '开始模拟面试', exact: true });
  await dialog.getByRole('button', { name: '完整模拟', exact: true }).click();
  const started = await postFromUI('/interview/start', () => dialog.getByRole('button', { name: '开始面试', exact: true }).click());
  assert.equal(started.interview.mode, 'FULL_SIMULATION'); assert.equal(started.interview.targetJobId, job.id);
  const runInterview = async (id, score) => {
    await page.waitForURL(url => url.pathname === `/interview/${id}`);
    await page.getByRole('button', { name: '确认无误，开始面试', exact: true }).waitFor();
    const confirmed = await postFromUI(`/interview/${id}/confirm-resume`, () => page.getByRole('button', { name: '确认无误，开始面试', exact: true }).click()); assert.equal(confirmed.success, true);
    const composer = page.locator('textarea'); await composer.waitFor(); assert.equal(await composer.isEnabled(), true);
    const answer = `Synthetic ${score} answer: React effects apply after rendering and cleanup releases resources.`;
    await composer.fill(answer); const reply = waitPost(`/interview/${id}/message`);
    await composer.press('Control+Enter'); const response = await reply; assert.equal(response.status(), 200); assert.match(response.headers()['content-type'], /text\/event-stream/);
    const frames = (await response.text()).split('\n\n').filter(line => line.startsWith('data: ')).map(line => line.slice(6));
    assert.equal(frames.at(-1), '[DONE]'); const events = frames.filter(line => line !== '[DONE]').map(JSON.parse);
    assert.ok(events.some(event => event.type === 'token' && event.content)); assert.ok(events.every(event => ['token', 'heartbeat'].includes(event.type)));
    await page.getByText('这是合成工程验收回复。请说明如何验证资源清理和重复执行的边界。', { exact: true }).waitFor();
    assert.equal(await composer.isEnabled(), true);
    const ended = await postFromUI(`/interview/${id}/end`, () => page.getByRole('button', { name: '结束并生成报告', exact: true }).click());
    assert.ok(ended.report?.id); assert.equal(ended.report.interviewId, id);
    await page.waitForURL(url => url.pathname === `/reports/${id}`);
    await page.getByRole('heading', { name: '问题、回答与评价依据', exact: true }).waitFor();
    const detail = await read(`/interview/${id}`), evidence = await read(`/interview/${id}/evidence`);
    assert.equal(detail.report.overallScore, score); assert.equal(evidence.length, 1);
    const card = page.locator('article').filter({ has: page.getByRole('heading', { name: evidence[0].question.question, exact: true }) });
    await card.waitFor(); assert.ok((await card.innerText()).includes(evidence[0].answer.content)); assert.ok((await card.innerText()).includes(evidence[0].reason));
    const reportText = await page.locator('main').last().innerText(); assert.match(reportText, new RegExp(`${score}\\s*/\\s*100`));
    for (const key of ['technical', 'communication', 'logic', 'learning']) {
      assert.equal(detail.report.scores[key], score);
      const dimension = page.getByText(key, { exact: true }).locator('..');
      assert.ok((await dimension.innerText()).includes(String(Math.round(detail.report.scores[key]))));
    }
    const snapshot = inspect(), interview = snapshot.interviews.find(row => row.id === id);
    assert.equal(interview.status, 'COMPLETED'); assert.equal(interview.targetJobProfileVersion, 1);
    const requirements = snapshot.jobs.find(row => row.id === job.id).skillRequirements.filter(row => row.skill.slug === 'react' && row.skill.taxonomyVersion === 'job-keywords-v1'); assert.equal(requirements.length, 1);
    const skillId = requirements[0].skillId;
    const questions = snapshot.questions.filter(row => row.interviewId === id), answers = snapshot.answers.filter(row => row.interviewId === id), histories = snapshot.history.filter(row => row.interviewId === id);
    assert.equal(questions.length, 1); assert.equal(answers.length, 1); assert.equal(histories.length, 1);
    assert.equal(questions[0].category, 'frontend'); assert.equal(questions[0].skillId, skillId); assert.equal(answers[0].questionId, questions[0].id); assert.equal(answers[0].content, answer); assert.equal(histories[0].answerId, answers[0].id); assert.equal(histories[0].score, score / 100);
    if (score === 45) assert.deepEqual(questions[0].selectionMetadata.skillMapping, { version: 'question-job-lexical/v1', reason: 'unique-match', candidateSkillIds: [skillId], matchedTerms: ['react'] });
    const candidate = snapshot.messages.filter(row => row.interviewId === id && row.role === 'user'); assert.equal(candidate.length, 1); assert.equal(candidate[0].content, answer); assert.equal(answers[0].messageId, candidate[0].id);
    assert.equal(snapshot.messages.filter(row => row.replyToMessageId === candidate[0].id).length, 1);
    const report = snapshot.reports.find(row => row.interviewId === id), finals = snapshot.runs.filter(row => row.interviewId === id && row.mode === 'FINAL');
    assert.equal(finals.length, 1); assert.equal(finals[0].status, 'SUCCEEDED'); assert.equal(report.currentEvaluationRunId, finals[0].id);
    assert.equal(report.id, detail.report.id); assert.equal(report.overallScore, detail.report.overallScore); assert.deepEqual(report.scores, detail.report.scores);
    const formal = snapshot.evidence.filter(row => row.evaluationRunId === finals[0].id); assert.equal(formal.length, 1);
    assert.equal(formal[0].skillId, skillId); assert.equal(formal[0].questionId, questions[0].id); assert.equal(formal[0].answerId, answers[0].id); assert.equal(formal[0].score, score / 100); assert.equal(formal[0].id, evidence[0].id);
    return { snapshot, runId: finals[0].id, skillId, evidenceId: formal[0].id };
  };
  const first = await runInterview(started.interviewId, 45);
  assert.equal(first.snapshot.states.length, 1); assert.equal(first.snapshot.states[0].score, 45);
  await page.getByRole('link', { name: '查看训练', exact: true }).click();
  const recommendations = await postFromUI(`/interview/target-jobs/${job.id}/training-recommendations/refresh`, () => page.getByRole('button', { name: '更新建议', exact: true }).click());
  assert.equal(recommendations.length, 1); const recommendation = recommendations[0];
  assert.equal(recommendation.sourceRunId, first.runId); assert.equal(recommendation.skillId, first.skillId); assert.ok(recommendation.evidenceIds.includes(first.evidenceId));
  const row = page.locator('article').filter({ has: page.getByRole('heading', { name: 'React', exact: true }) });
  await row.waitFor(); assert.ok((await row.innerText()).includes(recommendation.objective));
  const listed = (await read(`/interview/training-recommendations?targetJobId=${job.id}`)).find(item => item.id === recommendation.id);
  assert.equal(listed.sourceRunId, first.runId); assert.equal(listed.status, 'READY');
  for (const prompt of listed.prompts) assert.ok((await row.innerText()).includes(prompt));
  assert.ok((await row.innerText()).includes(listed.sourceEvidence.reason));
  const beforeComplete = inspect();
  const attempt = await postFromUI(`/interview/training-recommendations/${recommendation.id}/complete`, () => row.getByRole('button', { name: '完成训练', exact: true }).click());
  await row.getByRole('button', { name: '开始复测', exact: true }).waitFor();
  const completed = inspect(); assert.deepEqual(completed.stats, beforeComplete.stats); assert.deepEqual(completed.states, beforeComplete.states);
  assert.equal(completed.attempts.length, 1); assert.equal(completed.attempts[0].id, attempt.id);
  control('profile-retest');
  const retest = await postFromUI('/interview/start', () => row.getByRole('button', { name: '开始复测', exact: true }).click());
  assert.equal(retest.interview.mode, 'SKILL_PRACTICE'); assert.equal(retest.interview.practiceSkillId, first.skillId);
  const second = await runInterview(retest.interviewId, 80);
  const state = second.snapshot.states.find(item => item.skillId === first.skillId); assert.equal(state.score, 62.5); assert.equal(state.trend, 35); assert.equal(state.evidenceCount, 2); assert.equal(state.sourceRunId, second.runId);
  assert.equal(second.snapshot.attempts.length, 1); assert.equal(second.snapshot.attempts[0].retestInterviewId, retest.interviewId);
  assert.equal(second.snapshot.evidence.filter(item => item.evaluationRunId === first.runId).length, 1);
  const starts = second.snapshot.usage.filter(item => item.type === 'INTERVIEW_START');
  assert.equal(starts.length, 2); assert.ok(starts.every(item => item.units === 1));
  assert.equal(second.snapshot.stats.externalRequests, 0); assert.ok(second.snapshot.stats.chat > first.snapshot.stats.chat);
  await page.reload(); await page.getByRole('heading', { name: '问题、回答与评价依据', exact: true }).waitFor();
  await page.getByRole('button', { name: '退出登录', exact: true }).first().click(); await page.getByLabel('用户名', { exact: true }).waitFor(); await login();
  await page.goto(`${origin}/reports/${retest.interviewId}`); await page.getByRole('heading', { name: '问题、回答与评价依据', exact: true }).waitFor();
  assert.match(await page.locator('main').last().innerText(), /80\s*\/\s*100/);
  await nav('训练').click(); await row.getByText('复测进行中', { exact: true }).waitFor();
  const persisted = await read(`/interview/training-recommendations?targetJobId=${job.id}`);
  assert.equal(persisted.find(item => item.id === recommendation.id).attempts[0].retestInterviewId, retest.interviewId);
  assert.equal(inspect().states.find(item => item.skillId === first.skillId).score, 62.5);
  assert.deepEqual(pageErrors, []);
  console.log('PASS golden browser engineering loop: actual UI register/job/TXT/start/confirm/default-multi SSE/FINAL React evidence -> training complete unchanged -> linked retest/new FINAL -> aggregation62.5/trend35 -> reload/relogin; synthetic scores, not model quality or learning gain; model calls occurred, externalRequests0');
} catch (error) { primary = error; throw error; }
finally {
  const errors = [];
  try { await context?.close(); } catch (error) { errors.push(error); }
  try { await browser?.close(); } catch (error) { errors.push(error); }
  try { control('profile-off'); } catch (error) { errors.push(error); }
  if (errors.length) throw new AggregateError([...(primary ? [primary] : []), ...errors], 'Golden browser profile/closure cleanup failed');
}
