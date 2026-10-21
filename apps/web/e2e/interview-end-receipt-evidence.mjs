import assert from 'node:assert/strict';

export async function verifyEndReceipt(page, data, control) {
  const loaded = page.waitForResponse(r => r.url().endsWith(`/api/interview/${data.alternateId}`) && r.ok()); loaded.catch(() => undefined);
  await page.evaluate(path => { history.pushState(null, '', path); dispatchEvent(new PopStateEvent('popstate')); }, `/interview/${data.alternateId}`);
  await loaded;
  const composer = page.getByPlaceholder('简历已上传，开始面试吧...', { exact: true });
  await composer.fill('Synthetic end receipt fixture');
  const refused = page.waitForResponse(r => r.url().endsWith(`/interview/${data.alternateId}/message`) && r.request().method() === 'POST'); refused.catch(() => undefined);
  await composer.press('Control+Enter'); assert.match(await (await refused).text(), /"type":"error"/);
  await page.getByRole('alert').filter({ hasText: '当前回答暂时无法处理' }).waitFor();
  const end = page.getByRole('button', { name: '结束并生成报告', exact: true });
  const pattern = `**/api/interview/${data.alternateId}/end`;
  const dialogs = []; const accept = dialog => { dialogs.push(dialog.message()); dialog.accept().catch(() => undefined); };
  page.on('dialog', accept);
  try {
    for (const status of [503, 200]) {
      const handler = route => route.fulfill({ status, contentType: 'application/json', body: '{}' });
      await page.route(pattern, handler);
      try {
        const receipt = page.waitForResponse(r => r.url().endsWith(`/interview/${data.alternateId}/end`)); receipt.catch(() => undefined);
        await end.click(); await receipt;
        await end.waitFor({ state: 'visible' });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
        assert.ok(page.url().endsWith(`/interview/${data.alternateId}`)); assert.equal(await end.isEnabled(), true);
        control('verify-end-present');
      } finally { await page.unroute(pattern, handler); }
    }
    assert.equal(dialogs.length, 2);
    assert.match(dialogs[0], /HTTP 503/);
    assert.match(dialogs[1], /结束结果未确认/);
    const receipt = page.waitForResponse(r => r.url().endsWith(`/interview/${data.alternateId}/end`)); receipt.catch(() => undefined);
    await end.click(); const real = await receipt; assert.equal(real.ok(), true); assert.deepEqual(await real.json(), { deleted: true, reason: 'no_messages' });
    await page.waitForURL(url => url.pathname === '/');
    control('verify-end-deleted');
    console.log('PASS end receipt browser: injected503/empty200 never navigate or mark completion; real zero-message end deletes owned interview and returns home, PG verified, zero model');
  } finally { page.off('dialog', accept); }
}
