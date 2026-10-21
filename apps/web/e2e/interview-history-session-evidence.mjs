import assert from 'node:assert/strict';

// Delay a real authenticated GET response; all messages below use draft-policy refusals.
export async function verifyHistorySessionBoundary(page, data, composer, sameSession = false) {
  let release, heldResolve, heldReject, finishedResolve;
  const released = new Promise(resolve => { release = resolve; });
  const held = new Promise((resolve, reject) => { heldResolve = resolve; heldReject = reject; }); held.catch(() => undefined);
  const finished = new Promise(resolve => { finishedResolve = resolve; });
  let started = false, handlerError, timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Held history GET timeout')), 20000); }); timeout.catch(() => undefined);
  const pattern = `**/api/interview/${data.interviewId}`;
  const handler = async route => {
    started = true;
    try {
      const upstream = await route.fetch({ timeout: 15000 });
      assert.equal(upstream.status(), 200);
      assert.deepEqual((await upstream.json()).messages, []);
      heldResolve(); await released;
      await route.fulfill({ response: upstream });
    } catch (error) { handlerError = error; heldReject(error); await route.abort().catch(() => undefined); }
    finally { finishedResolve(); }
  };
  const switchTo = id => page.evaluate(path => { history.pushState(null, '', path); dispatchEvent(new PopStateEvent('popstate')); }, `/interview/${id}`);
  await page.route(pattern, handler);
  try {
    await switchTo(data.interviewId); await Promise.race([held, timeout]);
    if (!sameSession) {
      const loaded = page.waitForResponse(r => r.url().endsWith(`/api/interview/${data.alternateId}`) && r.ok()); loaded.catch(() => undefined);
      await switchTo(data.alternateId); await Promise.race([loaded, timeout]);
    }
    const activeId = sameSession ? data.interviewId : data.alternateId;
    const answer = sameSession ? 'Synthetic same-session history order answer' : 'Synthetic current history ownership answer';
    await composer.fill(answer);
    const reply = page.waitForResponse(r => r.url().endsWith(`/interview/${activeId}/message`) && r.request().method() === 'POST'); reply.catch(() => undefined);
    await composer.press('Control+Enter');
    assert.match(await (await reply).text(), /"type":"error"/);
    await page.getByRole('alert').filter({ hasText: '当前回答暂时无法处理' }).waitFor();
    const currentMessage = page.getByText(answer, { exact: true });
    await currentMessage.waitFor();
    release(); await Promise.race([finished, timeout]);
    if (handlerError) throw handlerError;
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await currentMessage.count(), 1);
    assert.ok(page.url().endsWith(`/interview/${activeId}`));
    console.log(`PASS history ownership browser: held actual GET cannot erase ${sameSession ? 'same-session new' : 'SPA current-session'} optimistic message; draft refusal, no model work`);
  } finally {
    clearTimeout(timer); release(); if (started) await finished;
    await page.unroute(pattern, handler);
  }
}
