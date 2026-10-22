import assert from 'node:assert/strict';

// Whole real POST receipts are withheld; native body-only waiting is a unit contract.
export async function verifyTrainingTimeouts(page, control) {
  assert.equal(process.env.LAB_FIXTURE_SYNTHETIC, '1');
  const origin = 'http://localhost:5177';
  let prepared = false, primary;
  try {
    prepared = true;
    const fixture = JSON.parse(control('training-prepare'));
    await page.goto(`${origin}/training`);
    await page.getByRole('heading', { name: '训练建议', exact: true }).waitFor();
    const token = await page.evaluate(() => localStorage.getItem('ia_access_token')); assert.ok(token);
    const list = async () => {
      const response = await page.context().request.get(`${origin}/api/interview/training-recommendations?targetJobId=${encodeURIComponent(fixture.targetJobId)}`, { headers: { Authorization: `Bearer ${token}` } });
      assert.equal(response.status(), 200); return response.json();
    };
    const refreshPath = `${origin}/api/interview/target-jobs/${fixture.targetJobId}/training-recommendations/refresh`;
    const counts = new Map();
    const observe = request => { if (request.method() === 'POST') counts.set(request.url(), (counts.get(request.url()) || 0) + 1); };
    page.on('request', observe);
    try {
      const row = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Synthetic training UI skill', exact: true }) });
      const timed = async (kind, path, label, pendingLabel, verify) => {
        let release, arrive, rejectReady, finish, timer, started = false, actualBody, failure;
        const gate = new Promise(resolve => { release = resolve; });
        const ready = new Promise((resolve, reject) => { arrive = resolve; rejectReady = reject; }); ready.catch(() => undefined);
        const finished = new Promise(resolve => { finish = resolve; });
        const before = counts.get(path) || 0;
        const held = async route => {
          started = true;
          try {
            const actual = await route.fetch({ timeout: 15000 }); assert.equal(actual.status(), 201);
            actualBody = await actual.json(); arrive(); await gate;
            try { await route.fulfill({ response: actual }); } catch { await route.abort().catch(() => undefined); }
          } catch (error) { failure = error; rejectReady(error); await route.abort().catch(() => undefined); }
          finally { finish(); }
        };
        const deadline = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Training ${kind} native timeout evidence deadline`)), 90000); }); deadline.catch(() => undefined);
        await page.route(path, held, { times: 1 });
        try {
          const startedAt = Date.now();
          await page.getByRole('button', { name: label, exact: true }).click();
          await Promise.race([ready, deadline]);
          await verify(actualBody);
          assert.equal(await page.getByRole('button', { name: pendingLabel, exact: true }).isEnabled(), false);
          const timeoutMessage = page.getByRole('alert').filter({ hasText: '训练请求等待超时（60 秒），结果尚未确认。请更新建议后核验。' });
          await Promise.race([timeoutMessage.waitFor({ timeout: 75000 }), deadline]);
          const elapsed = Date.now() - startedAt; assert.ok(elapsed >= 59000, 'Must observe the real native timer');
          await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(button => button.textContent.trim() === '更新建议' && !button.disabled));
          assert.ok(page.url().endsWith('/training'));
          assert.equal(counts.get(path), before + 1, 'No automatic POST retry');
          release(); await Promise.race([finished, deadline]); if (failure) throw failure;
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          assert.ok(page.url().endsWith('/training'));
          await timeoutMessage.waitFor();
          assert.equal(counts.get(path), before + 1);
          console.log(`PASS training ${kind} timeout elapsed_ms=${elapsed}: actual201 withheld, unknown result visible, no automatic POST/navigation after late receipt release attempt`);
          return actualBody;
        } finally { clearTimeout(timer); release(); if (started) await finished; await page.unroute(path, held); }
      };
      const explicitRefresh = async expected => {
        const pending = page.waitForResponse(response => response.url() === refreshPath && response.request().method() === 'POST'); pending.catch(() => undefined);
        await page.getByRole('button', { name: '更新建议', exact: true }).click();
        assert.equal((await pending).status(), 201);
        const item = (await list()).find(value => value.skillId === fixture.skillId); assert.ok(item); assert.equal(item.status, expected);
        return item;
      };
      await timed('refresh', refreshPath, '更新建议', '更新中', async body => {
        assert.ok(Array.isArray(body));
        const item = (await list()).find(value => value.skillId === fixture.skillId);
        assert.ok(item); assert.equal(item.status, 'READY'); assert.equal(item.sourceRunId, fixture.sourceRunId);
      });
      assert.equal(await row.count(), 0, 'Withheld refresh cannot inject a successful list');
      const recommendation = await explicitRefresh('READY');
      await row.getByRole('button', { name: '完成训练', exact: true }).waitFor();
      const completePath = `${origin}/api/interview/training-recommendations/${recommendation.id}/complete`;
      await timed('complete', completePath, '完成训练', '正在记录', async body => {
        const persisted = JSON.parse(control('training-verify-complete'));
        assert.equal(body.id, persisted.attemptId); assert.equal(body.recommendationId, recommendation.id);
      });
      assert.equal(await row.getByRole('button', { name: '完成训练', exact: true }).isEnabled(), true);
      assert.equal(await row.getByRole('button', { name: '开始复测', exact: true }).count(), 0);
      await explicitRefresh('COMPLETED');
      await row.getByRole('button', { name: '开始复测', exact: true }).waitFor();
      const startPath = `${origin}/api/interview/start`;
      const receipt = await timed('retest', startPath, '开始复测', '正在创建复测', async body => {
        const persisted = JSON.parse(control('training-verify-retest'));
        assert.equal(body.interviewId, persisted.retestInterviewId); assert.equal(body.interview.id, body.interviewId);
      });
      assert.equal(await row.getByRole('button', { name: '开始复测', exact: true }).isEnabled(), true);
      const recovered = await explicitRefresh('RETEST_STARTED');
      await row.getByText('复测进行中', { exact: true }).waitFor();
      assert.equal(recovered.attempts.length, 1); assert.equal(recovered.attempts[0].retestInterviewId, receipt.interviewId);
      control('training-verify-retest');
      assert.ok(page.url().endsWith('/training'));
      console.log('PASS training timeout recovery: explicit recommendation updates read actual COMPLETED/RETEST_STARTED; unique retest and one INTERVIEW_START unit retained, no model work; browser withholds full responses, not body-only streams');
    } finally { page.off('request', observe); }
  } catch (error) { primary = error; throw error; }
  finally {
    if (prepared) { try { control('training-cleanup'); } catch (error) { throw new AggregateError([...(primary ? [primary] : []), error], 'Training timeout fixture cleanup failed'); } }
  }
}
