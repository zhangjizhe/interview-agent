import assert from 'node:assert/strict';

/** Continuous injected list failure, followed by a held real same-key read. */
export async function verifyQuestionListRetry(page, context, origin, saved, snapshot) {
  assert.equal(process.env.LAB_FIXTURE_SYNTHETIC, '1');
  assert.equal(origin, 'http://localhost:5176');
  const token = await page.evaluate(() => localStorage.getItem('ia_access_token'));
  const before = await snapshot();
  const pattern = `${origin}/api/interview/question-bank/list?*`;
  const target = url => new URL(url).searchParams.get('position') === saved.position;
  let failures = 0;
  const fail = async route => {
    if (!target(route.request().url())) return route.continue();
    failures++;
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Synthetic list unavailable' }) });
  };
  await page.route(pattern, fail);
  try {
    await page.getByLabel('岗位', { exact: true }).fill(saved.position);
    await page.getByRole('button', { name: '重试读取题库', exact: true }).waitFor({ timeout: 75000 });
    await page.getByText('题库暂不可用，请重试；未将读取失败显示为空数据。', { exact: true }).waitFor();
    assert.equal(await page.getByText('暂无题目', { exact: true }).count(), 0);
    assert.ok(failures >= 1);
    assert.deepEqual(await snapshot(), before);
  } finally { await page.unroute(pattern, fail); }
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let arrived;
  const actualReady = new Promise(resolve => { arrived = resolve; });
  let calls = 0;
  const held = async route => {
    if (!target(route.request().url())) return route.continue();
    calls++;
    const actual = await route.fetch({ timeout: 75000 });
    assert.equal(actual.status(), 200);
    const row = (await actual.json()).results.find(item => item.questionId === saved.questionId);
    assert.ok(row);
    for (const key of ['questionId', 'position', 'level', 'category', 'question', 'answer', 'tags']) assert.deepEqual(row[key], saved[key]);
    arrived(); await gate; await route.fulfill({ response: actual });
  };
  await page.route(pattern, held);
  let timeout;
  try {
    await page.getByRole('button', { name: '重试读取题库', exact: true }).click();
    await Promise.race([actualReady, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Real list retry did not arrive')), 75000); })]);
    clearTimeout(timeout);
    assert.equal(await page.getByRole('button', { name: '读取中', exact: true }).isEnabled(), false);
    assert.equal(await page.getByLabel('岗位', { exact: true }).inputValue(), saved.position);
    assert.equal(await page.evaluate(() => localStorage.getItem('ia_access_token')), token);
    assert.equal(await page.getByText('暂无题目', { exact: true }).count(), 0);
    release();
    await page.getByRole('heading', { name: saved.question, exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: '重试读取题库', exact: true }).count(), 0);
    assert.equal(calls, 1);
    assert.deepEqual(await snapshot(), before);
  } finally { clearTimeout(timeout); release(); await page.unroute(pattern, held); }
  const actual = await context.request.get(`${origin}/api/interview/question-bank/list?limit=50`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(actual.status(), 200);
  assert.ok((await actual.json()).results.some(item => item.questionId === saved.questionId));
  const restored = page.waitForResponse(response => new URL(response.url()).pathname === '/api/interview/question-bank/list' && !new URL(response.url()).searchParams.has('position') && response.request().method() === 'GET');
  void restored.catch(() => {});
  await page.getByLabel('岗位', { exact: true }).fill('');
  assert.equal((await restored).status(), 200);
  await page.getByRole('heading', { name: saved.question, exact: true }).waitFor();
}
