import assert from 'node:assert/strict';

export async function verifyEndLifecycle(page, data, control) {
  await page.goto(`http://localhost:5177/interview/${data.lifecycleId}`);
  const composer = page.getByPlaceholder('简历已上传，开始面试吧...', { exact: true });
  await composer.fill('Synthetic held end lifecycle');
  const refusal = page.waitForResponse(r => r.url().endsWith(`/interview/${data.lifecycleId}/message`) && r.request().method() === 'POST'); refusal.catch(() => undefined);
  await composer.press('Control+Enter'); assert.match(await (await refusal).text(), /"type":"error"/);
  await page.getByRole('alert').filter({ hasText: '当前回答暂时无法处理' }).waitFor();
  let release, heldResolve, heldReject, finishedResolve, started = false, failure, timer;
  const released = new Promise(resolve => { release = resolve; });
  const held = new Promise((resolve, reject) => { heldResolve = resolve; heldReject = reject; }); held.catch(() => undefined);
  const finished = new Promise(resolve => { finishedResolve = resolve; });
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Held end lifecycle timeout')), 20000); }); timeout.catch(() => undefined);
  const pattern = `**/api/interview/${data.lifecycleId}/end`;
  const dialogs = []; const accept = dialog => { dialogs.push(dialog.message()); dialog.accept().catch(() => undefined); };
  const handler = async route => {
    started = true;
    try {
      const upstream = await route.fetch({ timeout: 15000 }); assert.equal(upstream.ok(), true); assert.deepEqual(await upstream.json(), { deleted: true, reason: 'no_messages' });
      heldResolve(); await released; await route.fulfill({ response: upstream });
    } catch (error) { failure = error; heldReject(error); await route.abort().catch(() => undefined); }
    finally { finishedResolve(); }
  };
  await page.route(pattern, handler); page.on('dialog', accept);
  try {
    await page.getByRole('button', { name: '结束并生成报告', exact: true }).click();
    await Promise.race([held, timeout]); control('verify-lifecycle-deleted');
    const loaded = page.waitForResponse(r => r.url().endsWith(`/api/interview/${data.interviewId}`) && r.ok()); loaded.catch(() => undefined);
    await page.evaluate(path => { history.pushState(null, '', path); dispatchEvent(new PopStateEvent('popstate')); }, `/interview/${data.interviewId}`);
    await Promise.race([loaded, timeout]);
    await composer.fill('Current interview draft survives late end');
    release(); await Promise.race([finished, timeout]); if (failure) throw failure;
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.ok(page.url().endsWith(`/interview/${data.interviewId}`));
    assert.equal(await composer.inputValue(), 'Current interview draft survives late end'); assert.equal(await composer.isEnabled(), true); assert.deepEqual(dialogs, []);
    control('verify-lifecycle-deleted');
    console.log('PASS end lifecycle browser: held real empty-interview deletion receipt cannot redirect/alert/lock another interview after SPA switch; PG deletion verified, zero model');
  } finally { clearTimeout(timer); release(); if (started) await finished; await page.unroute(pattern, handler); page.off('dialog', accept); }
}
