import { prepareQuestion } from './interview-question-fixture.mjs';
import assert from 'node:assert/strict';

// Hold an actual zero-model draft-policy refusal, never manufacture SSE tokens.
export async function verifyStreamSessionBoundary(page, data, composer) {
  let release;
  const released = new Promise(resolve => { release = resolve; });
  let resolveHeld, rejectHeld, resolveFinished;
  const held = new Promise((resolve, reject) => { resolveHeld = resolve; rejectHeld = reject; }); held.catch(() => undefined);
  const finished = new Promise(resolve => { resolveFinished = resolve; });
  const pattern = `**/api/interview/${data.interviewId}/message`;
  let handlerStarted = false;
  let handlerError;
  const handler = async route => {
    handlerStarted = true;
    try {
      const upstream = await route.fetch(); assert.equal(upstream.status(), 200);
      const text = await upstream.text(); assert.match(text, /"type":"error"/); assert.ok(!text.includes('[DONE]'));
      resolveHeld(); await released;
      // Navigation is allowed to abort this already completed server request.
      try { await route.fulfill({ response: upstream }); } catch { await route.abort().catch(() => undefined); }
    } catch (error) { handlerError = error; rejectHeld(error); await route.abort().catch(() => undefined); }
    finally { resolveFinished(); }
  };
  await page.route(pattern, handler);
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Held real SSE fixture timeout')), 20000); }); timeout.catch(() => undefined);
  try {
    await composer.fill('Synthetic held session answer'); await composer.press('Control+Enter');
    await Promise.race([held, timeout]);
    assert.equal(await composer.isDisabled(), true);
    const loaded = page.waitForResponse(r => r.url().endsWith(`/api/interview/${data.alternateId}`) && r.ok()); loaded.catch(() => undefined);
    await page.evaluate(path => { history.pushState(null, '', path); dispatchEvent(new PopStateEvent('popstate')); }, `/interview/${data.alternateId}`);
    await Promise.race([loaded, timeout]);
    await prepareQuestion(page, data.alternateId);
    await composer.fill('New session draft must survive');
    release(); await Promise.race([finished, timeout]);
    if (handlerError) throw handlerError;
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await composer.inputValue(), 'New session draft must survive');
    assert.equal(await composer.isEnabled(), true);
    assert.equal(await page.getByRole('alert').filter({ hasText: '当前回答暂时无法处理' }).count(), 0);
    assert.ok(!(await page.locator('body').innerText()).includes('Synthetic held session answer'));
    console.log('PASS session boundary browser: held actual SSE refusal cannot replace new-session draft/error/state after SPA switch; no new model work');
  } finally {
    clearTimeout(timer); release();
    if (handlerStarted) await finished;
    await page.unroute(pattern, handler);
  }
}
