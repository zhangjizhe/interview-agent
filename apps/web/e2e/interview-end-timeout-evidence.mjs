import { prepareQuestion } from './interview-question-fixture.mjs';
import assert from 'node:assert/strict';

// This holds the whole actual response, not a fabricated body-only stream.
export async function verifyEndTimeout(page, data, control) {
  await page.goto(`http://localhost:5177/interview/${data.timeoutId}`);
  const composer = await prepareQuestion(page, data.timeoutId);
  await composer.fill('Synthetic timeout lifecycle');
  const refusal = page.waitForResponse(r => r.url().endsWith(`/interview/${data.timeoutId}/message`) && r.request().method() === 'POST'); refusal.catch(() => undefined);
  await composer.press('Control+Enter'); assert.match(await (await refusal).text(), /"type":"error"/);
  await page.getByRole('alert').filter({ hasText: '当前回答暂时无法处理' }).waitFor();
  let release, heldResolve, heldReject, finishedResolve, started = false, failure, timer;
  const released = new Promise(resolve => { release = resolve; });
  const held = new Promise((resolve, reject) => { heldResolve = resolve; heldReject = reject; }); held.catch(() => undefined);
  const finished = new Promise(resolve => { finishedResolve = resolve; });
  const deadline = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Browser timeout evidence deadline')), 75000); }); deadline.catch(() => undefined);
  const pattern = `**/api/interview/${data.timeoutId}/end`;
  const handler = async route => {
    started = true;
    try {
      const upstream = await route.fetch({ timeout: 15000 }); assert.equal(upstream.ok(), true); assert.deepEqual(await upstream.json(), { deleted: true, reason: 'no_answers' });
      heldResolve(); await released;
      try { await route.fulfill({ response: upstream }); } catch { await route.abort().catch(() => undefined); }
    } catch (error) { failure = error; heldReject(error); await route.abort().catch(() => undefined); }
    finally { finishedResolve(); }
  };
  let dialogResolve;
  const dialog = new Promise(resolve => { dialogResolve = resolve; });
  const accept = popup => { popup.accept().catch(() => undefined); dialogResolve(popup.message()); };
  page.on('dialog', accept); await page.route(pattern, handler);
  try {
    const startedAt = performance.now();
    await page.getByRole('button', { name: '结束并生成报告', exact: true }).click();
    await Promise.race([held, deadline]); control('verify-timeout-deleted');
    const message = await Promise.race([dialog, deadline]);
    const elapsedMs = performance.now() - startedAt;
    assert.ok(elapsedMs >= 59_000, `Timeout fired too early: ${elapsedMs}`);
    assert.match(message, /结束请求超时（60 秒），结果尚未确认/);
    const end = page.getByRole('button', { name: '结束并生成报告', exact: true }); await end.waitFor(); assert.equal(await end.isEnabled(), true);
    assert.ok(page.url().endsWith(`/interview/${data.timeoutId}`));
    release(); await Promise.race([finished, deadline]); if (failure) throw failure;
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.ok(page.url().endsWith(`/interview/${data.timeoutId}`)); control('verify-timeout-deleted');
    console.log('PASS end timeout browser elapsed_ms=' + Math.round(elapsedMs) + ': actual deleted resource with withheld response reaches native60s timeout, stays uncertain without navigation, PG deletion verified; not a body-only browser stream or server cancellation');
  } finally { clearTimeout(timer); release(); if (started) await finished; await page.unroute(pattern, handler); page.off('dialog', accept); }
}
