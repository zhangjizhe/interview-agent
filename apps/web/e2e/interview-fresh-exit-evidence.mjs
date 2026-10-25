import assert from 'node:assert/strict';
import { assertPresentedQuestion } from './interview-question-fixture.mjs';

// The empty synthetic session is seeded; confirmation and end use real UI/API.
export async function verifyFreshConfirmationExit(page, data, control) {
  const id = data.freshExitId; assert.ok(id);
  const origin = 'http://localhost:5177';
  const loaded = page.waitForResponse(r => r.url() === `${origin}/api/interview/${id}` && r.ok()); loaded.catch(() => undefined);
  await page.evaluate(path => { history.pushState(null, '', path); dispatchEvent(new PopStateEvent('popstate')); }, `/interview/${id}`);
  const initial = await (await loaded).json();
  assert.equal(initial.resumeConfirmed, false); assert.deepEqual(initial.messages, []);
  let messagePosts = 0;
  const count = request => { if (request.method() === 'POST' && request.url() === `${origin}/api/interview/${id}/message`) messagePosts++; };
  const dialogs = []; const accept = dialog => { dialogs.push(dialog.message()); dialog.accept().catch(() => undefined); };
  page.on('request', count); page.on('dialog', accept);
  try {
    const receipt = page.waitForResponse(r => r.url() === `${origin}/api/interview/${id}/confirm-resume` && r.request().method() === 'POST'); receipt.catch(() => undefined);
    await page.getByRole('button', { name: '确认无误，开始面试', exact: true }).click();
    const confirmation = await receipt; assert.equal(confirmation.status(), 201);
    await assertPresentedQuestion(page, id, await confirmation.json());
    control('verify-fresh-exit-present');
    const end = page.getByRole('button', { name: '退出面试，不生成报告', exact: true });
    await end.waitFor();
    const pattern = `**/api/interview/${id}/end`;
    for (const status of [503, 200]) {
      const refuse = route => route.fulfill({ status, contentType: 'application/json', body: '{}' });
      await page.route(pattern, refuse);
      try {
        const response = page.waitForResponse(r => r.url() === `${origin}/api/interview/${id}/end`); response.catch(() => undefined);
        await end.click(); await response;
        await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(button => button.textContent.includes('退出面试，不生成报告') && !button.disabled));
        await end.waitFor();
        assert.equal(new URL(page.url()).pathname, `/interview/${id}`);
        control('verify-fresh-exit-present');
      } finally { await page.unroute(pattern, refuse); }
    }
    assert.equal(dialogs.length, 2); assert.match(dialogs[0], /HTTP 503/); assert.match(dialogs[1], /结束结果未确认/);
    const response = page.waitForResponse(r => r.url() === `${origin}/api/interview/${id}/end`); response.catch(() => undefined);
    await end.click(); const result = await response;
    assert.equal(result.status(), 201); assert.deepEqual(await result.json(), { deleted: true, reason: 'no_answers' });
    await page.waitForURL(url => url.pathname === '/');
    assert.equal(messagePosts, 0);
    control('verify-fresh-exit-deleted');
    console.log('PASS fresh confirmation exit: initial messages0 -> real confirmation/OPEN -> no answer POST -> end refusal/empty receipt stays -> actual no_answers deletion and PG cascade, no report');
  } finally { page.off('request', count); page.off('dialog', accept); }
}
