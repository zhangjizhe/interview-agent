import assert from 'node:assert/strict';

// Formal evidence is seeded in private PG; all actions below use real product HTTP.
export async function verifyTrainingActions(page, control) {
  assert.equal(process.env.LAB_FIXTURE_SYNTHETIC, '1');
  const origin = 'http://localhost:5177';
  let prepared = false, primary;
  try {
    prepared = true;
    const fixture = JSON.parse(control('training-prepare'));
    await page.goto(`${origin}/training`);
    await page.getByRole('heading', { name: '训练建议', exact: true }).waitFor();
    const token = await page.evaluate(() => localStorage.getItem('ia_access_token')); assert.ok(token);
    const read = async () => {
      const response = await page.context().request.get(`${origin}/api/interview/training-recommendations?targetJobId=${encodeURIComponent(fixture.targetJobId)}`, { headers: { Authorization: `Bearer ${token}` } });
      assert.equal(response.status(), 200); return response.json();
    };
    const refresh = page.waitForResponse(r => new URL(r.url()).pathname === `/api/interview/target-jobs/${fixture.targetJobId}/training-recommendations/refresh` && r.request().method() === 'POST'); refresh.catch(() => undefined);
    await page.getByRole('button', { name: '更新建议', exact: true }).click();
    assert.equal((await refresh).status(), 201);
    await page.getByRole('heading', { name: 'Synthetic training UI skill', exact: true }).waitFor();
    const recommendation = (await read()).find(item => item.skillId === fixture.skillId); assert.ok(recommendation);
    assert.equal(recommendation.status, 'READY'); assert.equal(recommendation.sourceRunId, fixture.sourceRunId);
    assert.equal(recommendation.targetJobId, fixture.targetJobId); assert.equal(recommendation.targetJobProfileVersion, 1);
    const row = page.locator('article').filter({ has: page.getByRole('heading', { name: recommendation.skill.name, exact: true }) });
    assert.ok((await row.innerText()).includes(recommendation.objective));
    assert.ok((await row.innerText()).includes(recommendation.sourceEvidence.reason));
    for (const prompt of recommendation.prompts) assert.ok((await row.innerText()).includes(prompt));
    const count = { complete: 0, retest: 0 };
    const completePath = `${origin}/api/interview/training-recommendations/${recommendation.id}/complete`;
    const startPath = `${origin}/api/interview/start`;
    const observe = request => { if (request.method() === 'POST') { if (request.url() === completePath) count.complete++; if (request.url() === startPath) count.retest++; } };
    page.on('request', observe);
    try {
      const execute = async (kind, path, label, pendingLabel) => {
        const refusal = async route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: `Synthetic ${kind} refused` }) });
        await page.route(path, refusal, { times: 1 });
        try {
          await row.getByRole('button', { name: label, exact: true }).click();
          await page.getByRole('alert').filter({ hasText: `Synthetic ${kind} refused` }).waitFor();
          await row.getByRole('button', { name: label, exact: true }).waitFor();
          assert.equal(await row.getByRole('button', { name: label, exact: true }).isEnabled(), true);
          assert.equal((await read()).find(item => item.id === recommendation.id).status, kind === 'complete' ? 'READY' : 'COMPLETED');
        } finally { await page.unroute(path, refusal); }
        let release, arrive, reject, finish, started = false, actualBody, failure, timer;
        const gate = new Promise(resolve => { release = resolve; });
        const ready = new Promise((resolve, rejectReady) => { arrive = resolve; reject = rejectReady; }); ready.catch(() => undefined);
        const finished = new Promise(resolve => { finish = resolve; });
        const held = async route => {
          started = true;
          try {
            if (kind === 'retest') assert.deepEqual(route.request().postDataJSON(), { targetJobId: fixture.targetJobId, mode: 'SKILL_PRACTICE', practiceSkillId: fixture.skillId, trainingRecommendationId: recommendation.id });
            const actual = await route.fetch({ timeout: 15000 }); assert.equal(actual.status(), 201); actualBody = await actual.json();
            arrive(); await gate; await route.fulfill({ response: actual });
          } catch (error) { failure = error; reject(error); await route.abort().catch(() => undefined); }
          finally { finish(); }
        };
        const deadline = new Promise((_, rejectTimeout) => { timer = setTimeout(() => rejectTimeout(new Error(`Training ${kind} deadline`)), 30000); }); deadline.catch(() => undefined);
        await page.route(path, held, { times: 1 });
        try {
          await row.getByRole('button', { name: label, exact: true }).click();
          await Promise.race([ready, deadline]);
          assert.equal(await row.getByRole('button', { name: pendingLabel, exact: true }).isEnabled(), false);
          assert.equal(await page.getByRole('button', { name: '更新建议', exact: true }).isEnabled(), false);
          const persisted = JSON.parse(control(kind === 'complete' ? 'training-verify-complete' : 'training-verify-retest'));
          assert.equal(persisted.recommendationId, recommendation.id);
          if (kind === 'complete') { assert.equal(actualBody.id, persisted.attemptId); assert.equal(actualBody.recommendationId, recommendation.id); }
          else { assert.equal(actualBody.interviewId, persisted.retestInterviewId); assert.equal(actualBody.interview.id, persisted.retestInterviewId); }
          assert.equal(count[kind], 2, 'one injected refusal and one explicit actual request, no auto retry');
          release(); await Promise.race([finished, deadline]); if (failure) throw failure;
          return actualBody;
        } finally { clearTimeout(timer); release(); if (started) await finished; await page.unroute(path, held); }
      };
      await execute('complete', completePath, '完成训练', '正在记录');
      await row.getByRole('button', { name: '开始复测', exact: true }).waitFor();
      const completed = (await read()).find(item => item.id === recommendation.id);
      assert.equal(completed.status, 'COMPLETED'); assert.equal(completed.attempts.length, 1);
      const started = await execute('retest', startPath, '开始复测', '正在创建复测');
      await page.waitForURL(url => url.pathname === `/interview/${started.interviewId}`);
      await page.getByRole('button', { name: '确认无误，开始面试', exact: true }).waitFor({ state: 'visible' });
      assert.equal(await page.getByRole('button', { name: '确认无误，开始面试', exact: true }).isVisible(), true);
      await page.goto(`${origin}/training`);
      await row.getByText('复测进行中', { exact: true }).waitFor();
      const persisted = (await read()).find(item => item.id === recommendation.id);
      assert.equal(persisted.status, 'RETEST_STARTED'); assert.equal(persisted.attempts.length, 1);
      assert.equal(persisted.attempts[0].retestInterviewId, started.interviewId);
      control('training-verify-retest');
      assert.equal(count.complete, 2); assert.equal(count.retest, 2);
      console.log('PASS training actions: formal synthetic source -> actual recommendation/complete/attempt -> actual start/interview link; pending/failure recovery, refreshed persisted status, one INTERVIEW_START unit and zero model increments');
    } finally { page.off('request', observe); }
  } catch (error) { primary = error; throw error; }
  finally {
    if (prepared) { try { control('training-cleanup'); } catch (error) { throw new AggregateError([...(primary ? [primary] : []), error], 'Training fixture cleanup failed'); } }
  }
}
