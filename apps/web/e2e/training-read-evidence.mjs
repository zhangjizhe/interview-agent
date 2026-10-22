import assert from 'node:assert/strict';

// Browser holds whole actual GET receipts. Header/body-specific deadlines are unit evidence.
export async function verifyTrainingReads(page, control) {
  assert.equal(process.env.LAB_FIXTURE_SYNTHETIC, '1');
  const origin = 'http://localhost:5177';
  let prepared = false, primary;
  const requestCounts = new Map();
  const observe = request => { if (request.method() === 'POST') requestCounts.set(request.url(), (requestCounts.get(request.url()) || 0) + 1); };
  // Web Vitals uses POST/sendBeacon too. Keep every URL for diagnostics, and
  // exclude only that exact read-only telemetry endpoint from write assertions.
  const writes = () => [...requestCounts].filter(([url]) => new URL(url).pathname !== '/api/metrics/vitals');
  const assertWrites = expected => assert.equal(writes().reduce((sum, [, count]) => sum + count, 0), expected, JSON.stringify([...requestCounts]));
  page.on('request', observe);
  const token = await page.evaluate(() => localStorage.getItem('ia_access_token')); assert.ok(token);
  const headers = { Authorization: `Bearer ${token}` };
  const readError = page.getByRole('alert').filter({ hasText: '训练建议暂时无法加载。' });
  const reload = page.getByRole('button', { name: '重新加载', exact: true });
  const row = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Synthetic training UI skill', exact: true }) });
  const prepare = async () => {
    prepared = true;
    const fixture = JSON.parse(control('training-prepare'));
    const response = await page.context().request.post(`${origin}/api/interview/target-jobs/${fixture.targetJobId}/training-recommendations/refresh`, { headers });
    assert.equal(response.status(), 201);
    const recommendation = (await response.json()).find(item => item.skillId === fixture.skillId); assert.ok(recommendation); assert.equal(recommendation.status, 'READY');
    return { fixture, recommendation };
  };
  const holdRead = async jobId => {
    let release, arrive, reject, finish, started = false, failure;
    const gate = new Promise(resolve => { release = resolve; });
    const ready = new Promise((resolve, rejectReady) => { arrive = resolve; reject = rejectReady; }); ready.catch(() => undefined);
    const finished = new Promise(resolve => { finish = resolve; });
    const pattern = `${origin}/api/interview/training-recommendations?*`;
    const handler = async route => {
      if (new URL(route.request().url()).searchParams.get('targetJobId') !== jobId) return route.continue();
      started = true;
      try {
        const actual = await route.fetch({ timeout: 15000 }); assert.equal(actual.status(), 200);
        const body = await actual.json(); assert.ok(Array.isArray(body)); arrive(body);
        await gate;
        try { await route.fulfill({ response: actual }); } catch { await route.abort().catch(() => undefined); }
      } catch (error) { failure = error; reject(error); await route.abort().catch(() => undefined); }
      finally { finish(); }
    };
    await page.route(pattern, handler, { times: 1 });
    let readyTimer;
    const boundedReady = Promise.race([ready, new Promise((_, reject) => { readyTimer = setTimeout(() => reject(new Error('Actual training GET did not arrive')), 20000); })]);
    boundedReady.catch(() => undefined);
    ready.finally(() => clearTimeout(readyTimer)).catch(() => undefined);
    return {
      ready: boundedReady, release,
      settle: async () => { release(); if (started) await finished; if (failure) throw failure; },
      cleanup: async () => { clearTimeout(readyTimer); release(); if (started) await finished; await page.unroute(pattern, handler); },
    };
  };
  try {
    const { fixture, recommendation } = await prepare();
    let jobsFailures = 0;
    const jobsPattern = `${origin}/api/interview/target-jobs`;
    const failJobs = async route => { jobsFailures++; await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Synthetic jobs read refused' }) }); };
    await page.route(jobsPattern, failJobs);
    try {
      await page.goto(`${origin}/training`);
      await readError.waitFor();
      assert.equal(await page.getByText('请先设置当前目标岗位。', { exact: true }).count(), 0);
      assert.equal(jobsFailures, 1, 'Read retry policy must not silently repeat failures');
      await reload.waitFor();
    } finally { await page.unroute(jobsPattern, failJobs); }
    const initial = await holdRead(fixture.targetJobId);
    try {
      const started = Date.now(); await reload.click();
      const actual = await initial.ready; assert.equal(actual[0].id, recommendation.id);
      await readError.waitFor({ timeout: 75000 }); assert.ok(Date.now() - started >= 59000);
      assert.equal(await reload.isEnabled(), true);
      assertWrites(0);
      await initial.settle();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await readError.waitFor();
    } finally { await initial.cleanup(); }
    await reload.click(); await row.getByRole('button', { name: '完成训练', exact: true }).waitFor();
    assertWrites(0);
    console.log('PASS training reads: jobs503 is not no-job, actual initial GET native60s timeout recovers using GET only; late receipt release attempt does not erase read error');

    const postRead = await holdRead(fixture.targetJobId);
    const completePath = `${origin}/api/interview/training-recommendations/${recommendation.id}/complete`;
    try {
      const post = page.waitForResponse(response => response.url() === completePath && response.request().method() === 'POST'); post.catch(() => undefined);
      const started = Date.now(); await row.getByRole('button', { name: '完成训练', exact: true }).click();
      const receipt = await post; assert.equal(receipt.status(), 201); assert.equal((await receipt.json()).recommendationId, recommendation.id);
      const actual = await postRead.ready; assert.equal(actual.find(item => item.id === recommendation.id).status, 'COMPLETED');
      control('training-verify-complete');
      await readError.waitFor({ timeout: 75000 }); assert.ok(Date.now() - started >= 59000);
      assert.equal(await reload.isEnabled(), true);
      assert.equal(requestCounts.get(completePath), 1);
      await postRead.settle();
      await reload.click(); await row.getByRole('button', { name: '开始复测', exact: true }).waitFor();
      control('training-verify-complete'); assert.equal(requestCounts.get(completePath), 1);
      assertWrites(1);
      console.log('Training read observed POST paths/counts: ' + JSON.stringify([...requestCounts].map(([url, count]) => [new URL(url).pathname, count])));
      console.log('PASS training post-write reads: real complete/Attempt persists before GET timeout; busy state ends, GET-only recovery shows COMPLETED without replaying complete or starting retest');
    } finally { await postRead.cleanup(); }
    control('training-cleanup'); prepared = false;

    const next = await prepare();
    const stale = await holdRead(next.fixture.targetJobId);
    try {
      await page.goto(`${origin}/training`);
      const old = await stale.ready; assert.equal(old.find(item => item.id === next.recommendation.id).status, 'READY');
      await page.evaluate(() => { history.pushState(null, '', '/practice'); dispatchEvent(new PopStateEvent('popstate')); });
      await page.waitForURL(url => url.pathname === '/practice');
      const completed = await page.context().request.post(`${origin}/api/interview/training-recommendations/${next.recommendation.id}/complete`, { headers });
      assert.equal(completed.status(), 201); control('training-verify-complete');
      await page.evaluate(() => { history.pushState(null, '', '/training'); dispatchEvent(new PopStateEvent('popstate')); });
      await row.getByRole('button', { name: '开始复测', exact: true }).waitFor();
      await stale.settle();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await row.getByRole('button', { name: '完成训练', exact: true }).count(), 0);
      assert.equal(await row.getByRole('button', { name: '开始复测', exact: true }).isVisible(), true);
      control('training-verify-complete');
      console.log('PASS training GET scope: actual old READY receipt cannot replace current persisted COMPLETED after SPA unmount/return; external fixture completion is metadata, not model work');
    } finally { await stale.cleanup(); }
  } catch (error) { primary = error; throw error; }
  finally {
    page.off('request', observe);
    if (prepared) { try { control('training-cleanup'); } catch (error) { throw new AggregateError([...(primary ? [primary] : []), error], 'Training reads fixture cleanup failed'); } }
  }
}
