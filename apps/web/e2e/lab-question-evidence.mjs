import assert from 'node:assert/strict';

export async function verifyQuestionEvidence(page, context, origin) {
  assert.equal(process.env.LAB_FIXTURE_SYNTHETIC, '1');
  assert.equal(origin, 'http://localhost:5176');
  const questionPath = '/api/interview/question-bank';
  const token = await page.evaluate(() => localStorage.getItem('ia_access_token'));
  assert.ok(token);
  const read = async position => {
    const response = await context.request.get(`${origin}${questionPath}/list?limit=50${position ? `&position=${encodeURIComponent(position)}` : ''}`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(response.status(), 200); return response.json();
  };
  const responseFor = (path, method = 'GET') => page.waitForResponse(response => new URL(response.url()).pathname === path && response.request().method() === method, { timeout: 75000 });
  await page.getByRole('button', { name: '题库治理', exact: true }).click();
  await page.getByText('暂无题目', { exact: true }).waitFor({ timeout: 20000 });
  await page.getByRole('button', { name: '新增题目', exact: true }).click();
  const form = page.locator('form.question-bank-create');
  const input = { position: 'Browser Fixture', level: 'P6', category: '幂等', question: 'Browser synthetic queue constraint', answer: 'Use an immutable request key.', tags: ['queue', 'fixture'] };
  for (const [label, value] of [['岗位', input.position], ['职级', input.level], ['分类', input.category], ['题目', input.question], ['参考答案', input.answer], ['标签', input.tags.join(',')]]) await form.getByLabel(label, { exact: true }).fill(value);
  const create = responseFor(questionPath, 'POST');
  const refreshed = responseFor(`${questionPath}/list`);
  // Observe rejections immediately; cleanup must not mask the first assertion failure.
  void create.catch(() => {}); void refreshed.catch(() => {});
  let releaseCreate; const createGate = new Promise(resolve => { releaseCreate = resolve; });
  const createPattern = `${origin}${questionPath}`;
  await page.route(createPattern, async route => { const started = Date.now(); const actual = await route.fetch({ timeout: 75000 }); console.log('Synthetic question POST actual response', actual.status(), 'elapsed_ms', Date.now() - started); await createGate; await route.fulfill({ response: actual }); });
  try {
    await form.getByRole('button', { name: '保存题目', exact: true }).click();
    try {
      await page.getByRole('button', { name: '保存中', exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: '保存中', exact: true }).isDisabled(), true);
      assert.equal(await page.getByRole('button', { name: '关闭新增', exact: true }).isDisabled(), true);
      // Filled textarea text participates in its wrapping label text; inspect all six controls directly.
      const fields = form.locator('input, textarea');
      assert.equal(await fields.count(), 6);
      for (const field of await fields.all()) assert.equal(await field.isDisabled(), true);
    } finally { releaseCreate(); }
    await create;
  } finally { releaseCreate(); await page.unroute(createPattern); }
  const createdResponse = await create; assert.equal(createdResponse.ok(), true);
  const created = await createdResponse.json(); assert.equal(created.success, true); assert.ok(created.questionId);
  const listResponse = await refreshed; assert.equal(listResponse.ok(), true);
  const list = await listResponse.json();
  const saved = list.results.find(item => item.questionId === created.questionId); assert.ok(saved);
  for (const field of ['position', 'level', 'category', 'question', 'answer']) assert.equal(saved[field], input[field]);
  assert.deepEqual(Array.isArray(saved.tags) ? saved.tags : saved.tags.split('、'), input.tags);
  const article = page.locator('article.question-bank-row').filter({ has: page.getByRole('heading', { name: saved.question, exact: true }) });
  const assertDisplay = async () => {
    await article.getByRole('heading', { name: saved.question, exact: true }).waitFor();
    assert.equal(await article.locator('.agent-eyebrow').innerText(), `${saved.position} / ${saved.level} / ${saved.category}`);
    const tags = Array.isArray(saved.tags) ? saved.tags.join('、') : saved.tags;
    assert.equal(await article.locator('div').first().locator(':scope > p').last().innerText(), `${saved.source || '来源未记录'} · ${tags || '无标签'}`);
  };
  await assertDisplay();
  const details = article.locator('details'), answer = details.locator('p');
  assert.equal(await details.evaluate(node => node.open), false); assert.equal(await answer.isVisible(), false);
  await details.locator('summary').click(); assert.equal(await details.evaluate(node => node.open), true);
  assert.equal(await answer.innerText(), saved.answer); assert.equal(await answer.isVisible(), true);
  await details.locator('summary').click(); assert.equal(await details.evaluate(node => node.open), false); assert.equal(await answer.isVisible(), false);
  await page.getByLabel('搜索题目', { exact: true }).fill('queue');
  const searchPattern = `${origin}${questionPath}/search?*`;
  await page.route(searchPattern, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Synthetic search unavailable' }) }), { times: 1 });
  const failedSearch = responseFor(`${questionPath}/search`); void failedSearch.catch(() => {});
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  assert.equal((await failedSearch).status(), 503);
  await page.getByText('Synthetic search unavailable', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('搜索题目', { exact: true }).inputValue(), 'queue');
  assert.equal(await page.evaluate(() => localStorage.getItem('ia_access_token')), token);
  await assertDisplay();
  assert.ok((await read()).results.some(item => item.questionId === saved.questionId));
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent === '搜索' && !button.disabled));
  let releaseSearch; const searchGate = new Promise(resolve => { releaseSearch = resolve; });
  let realSearches = 0;
  await page.route(searchPattern, async route => { realSearches++; const actual = await route.fetch({ timeout: 75000 }); await searchGate; await route.fulfill({ response: actual }); });
  const searched = responseFor(`${questionPath}/search`); void searched.catch(() => {});
  let searchResponse;
  try {
    await page.getByRole('button', { name: '搜索', exact: true }).click();
    try {
      await page.getByRole('button', { name: '搜索中', exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: '搜索中', exact: true }).isDisabled(), true);
      await assertDisplay();
      assert.equal(await page.getByLabel('搜索题目', { exact: true }).inputValue(), 'queue');
    } finally { releaseSearch(); }
    searchResponse = await searched;
    assert.equal(realSearches, 1);
  } finally { releaseSearch(); await page.unroute(searchPattern); }
  assert.equal(searchResponse.ok(), true);
  await page.waitForFunction(() => !document.body.textContent.includes('Synthetic search unavailable'));
  assert.equal(await page.evaluate(() => localStorage.getItem('ia_access_token')), token);
  const search = await searchResponse.json(); assert.equal(search.query, 'queue');
  const match = search.results.find(item => item.questionId === saved.questionId); assert.ok(match);
  for (const field of ['position', 'level', 'category', 'question', 'answer', 'tags']) assert.deepEqual(match[field], saved[field]);
  await page.getByRole('button', { name: '清除', exact: true }).waitFor(); await assertDisplay();
  await page.getByRole('button', { name: '清除', exact: true }).click();
  // Clear removes search-result state; the current UI intentionally retains the query text.
  assert.equal(await page.getByRole('button', { name: '清除', exact: true }).count(), 0);
  assert.equal(await page.getByLabel('搜索题目', { exact: true }).inputValue(), 'queue');
  const full = await read(); assert.equal(full.count, full.results.length);
  await article.waitFor(); assert.equal(await page.locator('article.question-bank-row').count(), full.results.length); await assertDisplay();
  const filter = page.locator('.question-bank-toolbar').getByLabel('岗位', { exact: true });
  const filtered = responseFor(`${questionPath}/list`); await filter.fill(saved.position);
  const filterResponse = await filtered; assert.equal(filterResponse.ok(), true);
  const filteredBody = await filterResponse.json(); assert.equal(filteredBody.position, saved.position);
  assert.equal(filteredBody.results.length, 1); assert.equal(filteredBody.results[0].questionId, saved.questionId); await assertDisplay();
  const missing = responseFor(`${questionPath}/list`); await filter.fill('No matching synthetic position');
  const missingResponse = await missing; assert.equal(missingResponse.ok(), true); assert.deepEqual((await missingResponse.json()).results, []);
  await page.getByText('暂无题目', { exact: true }).waitFor();
  await filter.fill(''); await article.waitFor(); await assertDisplay();
  let deletes = 0;
  const deletePath = `${questionPath}/${encodeURIComponent(saved.questionId)}`;
  const observe = request => { if (new URL(request.url()).pathname === deletePath && request.method() === 'DELETE') deletes++; };
  page.on('request', observe);
  try {
    page.once('dialog', dialog => dialog.dismiss()); await article.getByRole('button', { name: '删除题目', exact: true }).click();
    assert.equal(deletes, 0); assert.ok((await read()).results.some(item => item.questionId === saved.questionId)); await assertDisplay();
    let release; const gate = new Promise(resolve => { release = resolve; });
    const pattern = `${origin}${deletePath}`;
    await page.route(pattern, async route => { const actual = await route.fetch(); await gate; await route.fulfill({ response: actual }); });
    try {
      page.once('dialog', dialog => dialog.accept());
      const removed = responseFor(deletePath, 'DELETE');
      await article.getByRole('button', { name: '删除题目', exact: true }).click();
      try { await page.waitForFunction(() => document.querySelector('article.question-bank-row button')?.disabled === true); assert.equal(await article.getByRole('button', { name: '删除题目', exact: true }).isDisabled(), true); }
      finally { release(); }
      const deletedResponse = await removed; assert.equal(deletedResponse.ok(), true); assert.equal((await deletedResponse.json()).deleted, true);
      assert.equal(deletes, 1);
      await page.getByText('暂无题目', { exact: true }).waitFor({ timeout: 20000 });
      const after = await read(); assert.equal(after.results.some(item => item.questionId === saved.questionId), false); assert.equal(after.count, 0);
    } finally { release(); await page.unroute(pattern); }
  } finally { page.off('request', observe); }
  console.log('PASS question evidence: real POST/list/search fields, injected search503 session preservation and held real search pending, native answer disclosure, clear/filter, cancel zero DELETE, held real delete disabled and absent after Strong read');
}
