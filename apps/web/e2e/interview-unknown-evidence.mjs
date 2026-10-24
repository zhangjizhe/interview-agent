import assert from 'node:assert/strict';
import { assertPresentedQuestion } from './interview-question-fixture.mjs';

export async function verifyUnknownQuestion(page, data, control) {
  assert.equal(process.env.LAB_FIXTURE_SYNTHETIC, '1');
  const origin = 'http://localhost:5177'; assert.equal(new URL(page.url()).origin, origin);
  let prepared = false, primary;
  try {
    prepared = true; const fixture = JSON.parse(control('unknown-prepare'));
    await page.goto(`${origin}/interview/${fixture.interviewId}`);
    const confirmation = page.waitForResponse(r => r.url() === `${origin}/api/interview/${fixture.interviewId}/confirm-resume` && r.request().method() === 'POST'); confirmation.catch(() => undefined);
    await page.getByRole('button', { name: '确认无误，开始面试', exact: true }).click();
    const confirmed = await confirmation; assert.equal(confirmed.status(), 201);
    await assertPresentedQuestion(page, fixture.interviewId, await confirmed.json());
    const unknown = JSON.parse(control('unknown-mark'));
    const token = await page.evaluate(() => localStorage.getItem('ia_access_token')); assert.ok(token);
    const get = async () => {
      const response = await page.request.get(`${origin}/api/interview/${fixture.interviewId}`, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 });
      assert.equal(response.status(), 200); const value = await response.json();
      assert.equal(value.questionProtocol, 'presentation/v1'); assert.equal(value.currentQuestion.state, 'UNKNOWN');
      assert.equal(value.currentQuestion.presentationId, unknown.presentationId); assert.equal(value.currentQuestion.question, unknown.question);
      return value;
    };
    await get();
    const assertView = async () => {
      const panel = page.getByRole('region', { name: '当前题目', exact: true });
      await panel.getByRole('alert').filter({ hasText: '回答结果尚未确认，已暂停重复提交' }).waitFor();
      await panel.getByText(unknown.question, { exact: true }).waitFor();
      const composer = page.getByPlaceholder('请先核验当前题目状态...', { exact: true });
      assert.equal(await composer.isDisabled(), true);
      const send = composer.locator('..').locator('button').last(); assert.equal(await send.isDisabled(), true);
      let messagePosts = 0;
      const listener = request => { if (request.method() === 'POST' && request.url() === `${origin}/api/interview/${fixture.interviewId}/message`) messagePosts++; };
      page.on('request', listener);
      try {
        await page.keyboard.press('Control+Enter');
        // Even a synthetic event cannot bypass the React canAnswer guard.
        await composer.dispatchEvent('keydown', { key: 'Enter', ctrlKey: true });
        await send.dispatchEvent('click');
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert.equal(messagePosts, 0);
      } finally { page.off('request', listener); }
    };
    const loaded = page.waitForResponse(r => r.url() === `${origin}/api/interview/${fixture.interviewId}` && r.request().method() === 'GET'); loaded.catch(() => undefined);
    await page.reload(); assert.equal((await loaded).status(), 200); await assertView();
    await get(); control('unknown-verify');
    const reconcile = page.waitForResponse(r => r.url() === `${origin}/api/interview/${fixture.interviewId}/confirm-resume` && r.request().method() === 'POST'); reconcile.catch(() => undefined);
    await page.getByRole('button', { name: '核验题目状态', exact: true }).click();
    const reconciled = await reconcile; assert.equal(reconciled.status(), 201);
    const receipt = await reconciled.json(); assert.equal(receipt.questionProtocol, 'presentation/v1');
    assert.equal(receipt.currentQuestion.presentationId, unknown.presentationId); assert.equal(receipt.currentQuestion.state, 'UNKNOWN');
    await assertView(); control('unknown-verify');
    const ending = await page.request.post(`${origin}/api/interview/${fixture.interviewId}/end`, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 });
    assert.equal(ending.status(), 409); await get(); await assertView(); control('unknown-verify');
    // A second native reload verifies the state is durable rather than local UI.
    await page.reload(); await assertView(); await get(); control('unknown-verify');
    console.log('PASS UNKNOWN browser: controlled real claim/markUnknown -> actual GET and durable reload state, disabled answer/send/no message POST, actual end409, unchanged provider/ledger; not a provider failure simulation');
  } catch (error) { primary = error; throw error; }
  finally {
    try { if (prepared) control('unknown-cleanup'); }
    catch (error) { throw new AggregateError([...(primary ? [primary] : []), error], 'UNKNOWN browser cleanup failed'); }
    if (!primary) await page.goto(`${origin}/interview/${data.interviewId}`);
  }
}
