import assert from 'node:assert/strict';
import { prepareQuestion } from './interview-question-fixture.mjs';

// Hold a real refresh snapshot after loading the actual authoritative question.
export async function verifyHistorySessionBoundary(page, data, composer, sameSession = false) {
  const switchTo = id => page.evaluate(path => { history.pushState(null, '', path); dispatchEvent(new PopStateEvent('popstate')); }, `/interview/${id}`);
  if (!page.url().endsWith(`/interview/${data.interviewId}`)) {
    const loaded = page.waitForResponse(r => r.url().endsWith(`/api/interview/${data.interviewId}`) && r.ok()); loaded.catch(() => undefined);
    await switchTo(data.interviewId); await loaded;
  }
  await prepareQuestion(page, data.interviewId);
  let release, releaseFresh, heldResolve, heldReject, freshResolve;
  const released = new Promise(resolve => { release = resolve; });
  const freshReleased = new Promise(resolve => { releaseFresh = resolve; });
  const held = new Promise((resolve, reject) => { heldResolve = resolve; heldReject = reject; }); held.catch(() => undefined);
  const fresh = new Promise(resolve => { freshResolve = resolve; });
  let first = true, answerStarted = false, handlerError, timer;
  const handlers = [];
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Held history GET timeout')), 25000); }); timeout.catch(() => undefined);
  const pattern = '**/api/interview/*';
  const handler = route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== 'GET' || ![data.interviewId, data.alternateId].some(id => path === `/api/interview/${id}`)) return route.continue();
    const oldSnapshot = first && path === `/api/interview/${data.interviewId}`;
    if (!oldSnapshot && !answerStarted) return route.continue();
    if (oldSnapshot) first = false;
    const work = (async () => {
      try {
        const upstream = await route.fetch({ timeout: 15000 }); assert.equal(upstream.status(), 200);
        const snapshot = await upstream.json(); assert.equal(snapshot.questionProtocol, 'presentation/v1');
        assert.ok(snapshot.currentQuestion && snapshot.currentQuestion.state === 'OPEN');
        assert.ok(snapshot.messages.length > 0 && snapshot.messages.every(message => message.role === 'assistant'));
        if (oldSnapshot) { heldResolve(); await released; }
        else { freshResolve(); await freshReleased; }
        await route.fulfill({ response: upstream });
      } catch (error) { handlerError = error; heldReject(error); await route.abort().catch(() => undefined); }
    })();
    handlers.push(work); return work;
  };
  await page.route(pattern, handler);
  try {
    const scroller = page.locator('div.overflow-y-auto.relative').first();
    await scroller.evaluate(el => { el.scrollTop = 0; el.dispatchEvent(new TouchEvent('touchstart', { touches: [new Touch({ identifier: 1, target: el, clientY: 100 })] })); });
    await scroller.evaluate(el => el.dispatchEvent(new TouchEvent('touchmove', { touches: [new Touch({ identifier: 1, target: el, clientY: 300 })] })));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    await scroller.evaluate(el => el.dispatchEvent(new TouchEvent('touchend', { touches: [] })));
    await Promise.race([held, timeout]);
    if (!sameSession) {
      const loaded = page.waitForResponse(r => r.url().endsWith(`/api/interview/${data.alternateId}`) && r.ok()); loaded.catch(() => undefined);
      await switchTo(data.alternateId); await Promise.race([loaded, timeout]);
      await prepareQuestion(page, data.alternateId);
    }
    const activeId = sameSession ? data.interviewId : data.alternateId;
    const answer = sameSession ? 'Synthetic same-session history order answer' : 'Synthetic current history ownership answer';
    await composer.fill(answer);
    const reply = page.waitForResponse(r => r.url().endsWith(`/interview/${activeId}/message`) && r.request().method() === 'POST'); reply.catch(() => undefined);
    answerStarted = true;
    await composer.press('Control+Enter');
    assert.match(await (await reply).text(), /"type":"error"/);
    await page.getByRole('alert').filter({ hasText: '当前回答暂时无法处理' }).waitFor();
    // A failed answer is not durable. Hold its newer authoritative synchronization
    // separately so the assertion below isolates only the older refresh response.
    await Promise.race([fresh, timeout]);
    const currentMessage = page.getByText(answer, { exact: true }); await currentMessage.waitFor();
    release(); await Promise.race([handlers[0], timeout]); if (handlerError) throw handlerError;
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await currentMessage.count(), 1); assert.ok(page.url().endsWith(`/interview/${activeId}`));
    console.log(`PASS history ownership browser: held real refresh cannot erase ${sameSession ? 'same-session new' : 'SPA current-session'} optimistic message before newer authoritative synchronization; actual question, draft refusal, no model work`);
  } finally {
    clearTimeout(timer); release(); releaseFresh(); await Promise.all(handlers);
    await page.unroute(pattern, handler);
  }
}
