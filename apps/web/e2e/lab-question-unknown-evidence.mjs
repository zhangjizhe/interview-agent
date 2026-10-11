import assert from 'node:assert/strict';

/** Proxy-discarded successful receipt, not a natural API 503 or storage failure. */
export async function verifyQuestionUnknownEvidence(page, context, origin, snapshot) {
  assert.equal(process.env.LAB_FIXTURE_SYNTHETIC, '1');
  assert.equal(origin, 'http://localhost:5176');
  assert.equal(typeof snapshot, 'function');
  const path = '/api/interview/question-bank';
  const pattern = `${origin}${path}`;
  const token = await page.evaluate(() => localStorage.getItem('ia_access_token'));
  assert.ok(token);
  const headers = { Authorization: `Bearer ${token}` };
  const read = async () => {
    const response = await context.request.get(`${origin}${path}/list?limit=50`, { headers });
    assert.equal(response.status(), 200); return response.json();
  };
  assert.deepEqual((await read()).results, []);
  assert.equal(await page.locator('form.question-bank-create').count(), 0);
  const input = ['Synthetic Unknown', 'P6', 'Receipt', 'Synthetic unknown receipt question', 'Inspect persisted state before retry.', 'unknown,fixture'];
  const posts = [];
  const record = request => { if (request.method() === 'POST' && new URL(request.url()).pathname === path) posts.push(request); };
  const waitResponse = (target, method) => {
    const pending = page.waitForResponse(response => new URL(response.url()).pathname === target && response.request().method() === method, { timeout: 75000 });
    void pending.catch(() => {}); return pending;
  };
  let actualCreated;
  let routeCalls = 0;
  const handler = async route => {
    routeCalls++;
    const actual = await route.fetch({ timeout: 75000 });
    assert.equal(actual.status(), 201);
    actualCreated = await actual.json();
    assert.equal(actualCreated.success, true); assert.ok(actualCreated.questionId);
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'QUESTION_WRITE_UNCONFIRMED: inspect storage before retry' }) });
  };
  page.on('request', record);
  await page.route(pattern, handler, { times: 1 });
  try {
    await page.getByRole('button', { name: '新增题目', exact: true }).click();
    const form = page.locator('form.question-bank-create');
    const fields = form.locator('input, textarea');
    assert.equal(await fields.count(), 6);
    for (let i = 0; i < input.length; i++) await fields.nth(i).fill(input[i]);
    const before = await snapshot();
    const rejected = waitResponse(path, 'POST');
    await form.getByRole('button', { name: '保存题目', exact: true }).click();
    assert.equal((await rejected).status(), 503);
    await page.waitForFunction(() => { const button = document.querySelector('form.question-bank-create button[type="submit"]'); return button && !button.disabled; });
    await page.getByText(/QUESTION_WRITE_UNCONFIRMED.*若结果未知，请先刷新核验/).waitFor();
    assert.deepEqual(await Promise.all((await fields.all()).map(field => field.inputValue())), input);
    for (const field of await fields.all()) assert.equal(await field.isEnabled(), true);
    assert.equal(await page.getByRole('button', { name: '关闭新增', exact: true }).isEnabled(), true);
    assert.equal(await page.evaluate(() => localStorage.getItem('ia_access_token')), token);
    assert.equal(routeCalls, 1); assert.equal(posts.length, 1);
    const after = await snapshot();
    assert.equal(after.ledger, before.ledger + 1);
    assert.equal(after.provider.embedding, before.provider.embedding + 1);
    for (const key of ['chat', 'rerank', 'externalRequests']) assert.equal(after.provider[key], before.provider[key]);
    assert.equal(after.provider.externalRequests, 0);
    const saved = (await read()).results.find(row => row.questionId === actualCreated.questionId);
    assert.ok(saved);
    assert.deepEqual([saved.position, saved.level, saved.category, saved.question, saved.answer], input.slice(0, 5));
    assert.deepEqual(Array.isArray(saved.tags) ? saved.tags : saved.tags.split('、'), ['unknown', 'fixture']);
    const listed = waitResponse(`${path}/list`, 'GET');
    await page.reload();
    await page.getByRole('button', { name: '题库治理', exact: true }).click();
    const actualList = await listed; assert.equal(actualList.status(), 200);
    const reloadedRow = (await actualList.json()).results.find(row => row.questionId === saved.questionId);
    assert.ok(reloadedRow);
    for (const key of ['questionId', 'position', 'level', 'category', 'question', 'answer', 'tags']) assert.deepEqual(reloadedRow[key], saved[key]);
    const article = page.locator('article.question-bank-row').filter({ has: page.getByRole('heading', { name: input[3], exact: true }) });
    await article.waitFor();
    assert.ok((await article.textContent()).includes(`${saved.position} / ${saved.level} / ${saved.category}`));
    assert.ok((await article.textContent()).includes('unknown、fixture'));
    assert.equal(await article.locator('details').evaluate(element => element.open), false);
    await article.locator('summary').click();
    assert.equal(await article.locator('details p').textContent(), saved.answer);
    assert.equal(await page.locator('form.question-bank-create').count(), 0);
    assert.equal(await page.evaluate(() => localStorage.getItem('ia_access_token')), token);
    assert.equal(posts.length, 1);
    page.once('dialog', dialog => dialog.accept());
    const deleted = waitResponse(`${path}/${encodeURIComponent(saved.questionId)}`, 'DELETE');
    await article.getByTitle('删除题目').click();
    const removal = await deleted; assert.equal(removal.status(), 200); assert.equal((await removal.json()).deleted, true);
    await page.getByText('暂无题目', { exact: true }).waitFor();
    assert.deepEqual((await read()).results, []);
    assert.equal(posts.length, 1);
    assert.deepEqual(await snapshot(), after);
    await page.getByLabel('搜索题目', { exact: true }).fill('queue');
    assert.equal(await page.getByLabel('岗位', { exact: true }).inputValue(), '');
  } finally { await page.unroute(pattern, handler); page.off('request', record); }
}
