import assert from 'node:assert/strict';

export async function verifyQuestionRaceEvidence(page, context, origin, saved) {
  assert.equal(process.env.LAB_FIXTURE_SYNTHETIC, '1');
  assert.equal(origin, 'http://localhost:5176');
  assert.ok(saved.questionId);
  const base = '/api/interview/question-bank';
  const pattern = `${origin}${base}/search?*`;
  const query = page.getByLabel('搜索题目', { exact: true });
  const position = page.locator('.question-bank-toolbar').getByLabel('岗位', { exact: true });
  const token = await page.evaluate(() => localStorage.getItem('ia_access_token'));
  assert.ok(token);
  const responseFor = (path, predicate = () => true) => {
    const pending = page.waitForResponse(response => new URL(response.url()).pathname === path && response.request().method() === 'GET' && predicate(new URL(response.url())), { timeout: 75000 });
    void pending.catch(() => {}); return pending;
  };
  const waitReady = () => page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent === '搜索' && !button.disabled));
  const article = page.locator('article.question-bank-row').filter({ has: page.getByRole('heading', { name: saved.question, exact: true }) });
  await query.fill('queue'); await waitReady();
  let releaseSuccess, announceActual;
  const successGate = new Promise(resolve => { releaseSuccess = resolve; });
  const actualReady = new Promise(resolve => { announceActual = resolve; });
  let successes = 0;
  await page.route(pattern, async route => {
    successes++;
    const actual = await route.fetch({ timeout: 75000 });
    announceActual({ status: actual.status(), body: await actual.json(), url: route.request().url() });
    await successGate; await route.fulfill({ response: actual });
  });
  try {
    const delivered = responseFor(`${base}/search`);
    await page.getByRole('button', { name: '搜索', exact: true }).click();
    // The held request must have actually returned the old matching record.
    const actual = await Promise.race([actualReady, delivered.then(() => { throw Error('Old response unexpectedly delivered before release'); })]);
    assert.equal(actual.status, 200); assert.equal(new URL(actual.url).searchParams.get('q'), 'queue');
    assert.ok(actual.body.results.some(item => item.questionId === saved.questionId));
    await query.fill('new synthetic keyword');
    const noPosition = 'No matching synthetic race position';
    const emptyList = responseFor(`${base}/list`, url => url.searchParams.get('position') === noPosition);
    await position.fill(noPosition);
    const emptyResponse = await emptyList; assert.equal(emptyResponse.status(), 200); assert.deepEqual((await emptyResponse.json()).results, []);
    await page.getByText('暂无题目', { exact: true }).waitFor();
    releaseSuccess(); await delivered; await waitReady();
    assert.equal(successes, 1);
    assert.equal(await query.inputValue(), 'new synthetic keyword'); assert.equal(await position.inputValue(), noPosition);
    assert.equal(await article.count(), 0); assert.equal(await page.getByRole('button', { name: '清除', exact: true }).count(), 0);
    await page.getByText('暂无题目', { exact: true }).waitFor();
  } finally { releaseSuccess(); await page.unroute(pattern); }

  let releaseFailure, announceFailure;
  const failureGate = new Promise(resolve => { releaseFailure = resolve; });
  const failureReady = new Promise(resolve => { announceFailure = resolve; });
  let failures = 0;
  await page.route(pattern, async route => {
    failures++; announceFailure(); await failureGate;
    // Deliberately no route.fetch: this failed request never invokes the API/models.
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Synthetic stale search failure' }) });
  });
  try {
    const failed = responseFor(`${base}/search`);
    await page.getByRole('button', { name: '搜索', exact: true }).click();
    await Promise.race([failureReady, failed.then(() => { throw Error('Injected failure unexpectedly delivered before release'); })]);
    await query.fill('queue');
    const restoredList = responseFor(`${base}/list`, url => url.searchParams.get('position') === saved.position);
    await position.fill(saved.position);
    const restored = await restoredList; assert.equal(restored.status(), 200);
    assert.ok((await restored.json()).results.some(item => item.questionId === saved.questionId));
    await article.waitFor(); releaseFailure(); assert.equal((await failed).status(), 503); await waitReady();
    assert.equal(failures, 1); assert.equal(await query.inputValue(), 'queue'); assert.equal(await position.inputValue(), saved.position);
    assert.equal(await page.getByText('Synthetic stale search failure', { exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: '清除', exact: true }).count(), 0); await article.waitFor();
  } finally { releaseFailure(); await page.unroute(pattern); }

  const current = responseFor(`${base}/search`, url => url.searchParams.get('q') === 'queue' && url.searchParams.get('position') === saved.position);
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  const currentResponse = await current; assert.equal(currentResponse.status(), 200);
  const results = await currentResponse.json(); assert.equal(results.query, 'queue'); assert.equal(results.position, saved.position);
  const match = results.results.find(item => item.questionId === saved.questionId); assert.ok(match);
  for (const field of ['question', 'answer', 'position', 'level', 'category', 'tags']) assert.deepEqual(match[field], saved[field]);
  await page.getByRole('button', { name: '清除', exact: true }).waitFor(); await article.waitFor();
  await page.getByRole('button', { name: '清除', exact: true }).click();
  await position.fill(''); await query.fill('queue'); await article.waitFor();
  assert.equal(await page.getByRole('button', { name: '清除', exact: true }).count(), 0);
  assert.equal(await page.evaluate(() => localStorage.getItem('ia_access_token')), token);
  const listResponse = await context.request.get(`${origin}${base}/list?limit=50`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(listResponse.status(), 200); assert.ok((await listResponse.json()).results.some(item => item.questionId === saved.questionId));
  console.log('PASS search race: actual stale result and injected stale error discarded, real current query/position fields verified');
}
