import { assertPresentedQuestion } from './interview-question-fixture.mjs';
import assert from 'node:assert/strict';

export async function verifyConfirmationHistory(page, data, control) {
  control('prepare-confirmation');
  const switchTo = id => page.evaluate(path => { history.pushState(null, '', path); dispatchEvent(new PopStateEvent('popstate')); }, `/interview/${id}`);
  await switchTo(data.alternateId);
  const loaded = page.waitForResponse(r => r.url().endsWith(`/api/interview/${data.interviewId}`) && r.ok());
  loaded.catch(() => undefined);
  await switchTo(data.interviewId); const real = await loaded;
  const snapshot = await real.json(); assert.equal(snapshot.resumeConfirmed, false); assert.equal(snapshot.resume.name, 'Synthetic confirmation race');
  const confirm = page.getByRole('button', { name: '确认无误，开始面试', exact: true }); await confirm.waitFor();
  let release, heldResolve, heldReject, finishedResolve, started = false, failure;
  const released = new Promise(resolve => { release = resolve; });
  const held = new Promise((resolve, reject) => { heldResolve = resolve; heldReject = reject; }); held.catch(() => undefined);
  const finished = new Promise(resolve => { finishedResolve = resolve; });
  const pattern = `**/api/interview/${data.interviewId}`;
  const handler = async route => {
    started = true;
    try {
      const upstream = await route.fetch({ timeout: 15000 });
      assert.equal((await upstream.json()).resumeConfirmed, false);
      heldResolve(); await released; await route.fulfill({ response: upstream });
    } catch (error) { failure = error; heldReject(error); await route.abort().catch(() => undefined); }
    finally { finishedResolve(); }
  };
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Confirmation/history timeout')), 20000); }); timeout.catch(() => undefined);
  await page.route(pattern, handler);
  try {
    const scroller = page.locator('div.overflow-y-auto.relative').first();
    await scroller.evaluate(el => { el.scrollTop = 0; el.dispatchEvent(new TouchEvent('touchstart', { touches: [new Touch({ identifier: 1, target: el, clientY: 100 })] })); });
    await scroller.evaluate(el => { el.dispatchEvent(new TouchEvent('touchmove', { touches: [new Touch({ identifier: 1, target: el, clientY: 300 })] })); });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    await scroller.evaluate(el => el.dispatchEvent(new TouchEvent('touchend', { touches: [] })));
    await Promise.race([held, timeout]);
    const receipt = page.waitForResponse(r => r.url().endsWith(`/interview/${data.interviewId}/confirm-resume`) && r.request().method() === 'POST');
    receipt.catch(() => undefined);
    await confirm.click(); const confirmed = await receipt; assert.equal(confirmed.ok(), true);
    const confirmation = await confirmed.json();
    // APIRequestContext GET is independent of the held page GET.
    await assertPresentedQuestion(page, data.interviewId, confirmation);
    control('verify-confirmation');
    release(); await Promise.race([finished, timeout]); if (failure) throw failure;
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await confirm.count(), 0);
    assert.equal(await page.getByPlaceholder('输入当前题目的回答...', { exact: true }).isEnabled(), true);
    console.log('PASS confirmation history browser: actual pending refresh GET false cannot undo real acknowledged/PG-persisted confirmation; synthetic Milvus resume, no model');
  } finally { clearTimeout(timer); release(); if (started) await finished; await page.unroute(pattern, handler); }
}
