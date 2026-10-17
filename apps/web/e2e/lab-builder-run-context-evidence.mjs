import assert from 'node:assert/strict';
import { questionInputSnapshot } from './lab-question-input-snapshot.mjs';

/** Retry an already completed synthetic run; this must not call a model again. */
export async function verifyBuilderStartContext(page, context, origin) {
  assert.equal(process.env.LAB_FIXTURE_SYNTHETIC, '1');
  assert.equal(origin, 'http://localhost:5176');
  const id = await page.locator('.builder-workspace > label select').inputValue();
  const versionId = await page.locator('.builder-workspace select').nth(1).inputValue();
  const message = await page.getByLabel('测试输入', { exact: false }).inputValue();
  const path = `${origin}/api/agent-lab/agents/${id}/test-runs`;
  const before = await questionInputSnapshot();
  let failedKey;
  const refuse = async route => {
    failedKey = route.request().postDataJSON().requestKey;
    assert.equal(typeof failedKey, 'string'); assert.ok(failedKey.trim());
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Synthetic start receipt unavailable' }) });
  };
  await page.route(path, refuse, { times: 1 });
  await page.getByRole('button', { name: '启动草稿测试', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Synthetic start receipt unavailable' }).waitFor();
  await page.waitForFunction(() => { const input = document.querySelector('.builder-workspace .builder-confirm input'); return input && !input.disabled; });
  assert.deepEqual(await questionInputSnapshot(), before);
  let brokenReceipt;
  let rejectBroken;
  const brokenFailure = new Promise((_, reject) => { rejectBroken = reject; });
  void brokenFailure.catch(() => {});
  const broken = async route => {
    try {
      assert.equal(route.request().postDataJSON().requestKey, failedKey);
      const actual = await route.fetch({ timeout: 75000 }); assert.equal(actual.status(), 202);
      brokenReceipt = await actual.json(); assert.equal(brokenReceipt.reused, true); assert.ok(brokenReceipt.id);
      await route.fulfill({ status: 202, contentType: 'application/json', body: '{}' });
    } catch (error) { rejectBroken(error); await route.abort(); }
  };
  await page.route(path, broken, { times: 1 });
  try {
    const response = page.waitForResponse(item => item.url() === path && item.request().method() === 'POST');
    void response.catch(() => {});
    await page.getByRole('button', { name: '启动草稿测试', exact: true }).click();
    assert.equal((await Promise.race([response, brokenFailure])).status(), 202);
    await page.getByRole('alert').filter({ hasText: '运行启动未确认' }).waitFor();
    await page.waitForFunction(() => { const input = document.querySelector('.builder-workspace .builder-confirm input'); return input && !input.disabled; });
    assert.equal(await page.getByRole('heading', { name: `运行 ${brokenReceipt.id}`, exact: true }).count(), 1);
    assert.equal(await page.locator('.builder-confirm input').isChecked(), true);
    assert.equal(await page.getByLabel('测试输入', { exact: false }).inputValue(), message);
    assert.equal(await page.locator('.builder-workspace > label select').inputValue(), id);
    assert.equal(await page.locator('.builder-workspace select').nth(1).inputValue(), versionId);
    assert.equal(await page.getByText('草稿测试已排队，可查询状态或取消。', { exact: true }).count(), 0);
    assert.deepEqual(await questionInputSnapshot(), before);
  } finally { await page.unroute(path, broken); }
  for (const corruption of ['version', 'request']) {
  const runPath = `${origin}/api/agent-lab/runs/${brokenReceipt.id}`;
  let rejectBinding;
  const bindingFailure = new Promise((_, reject) => { rejectBinding = reject; });
  void bindingFailure.catch(() => {});
  const mismatch = async route => {
    try {
      const actual = await route.fetch({ timeout: 75000 }); assert.equal(actual.status(), 200);
      const persisted = await actual.json();
      assert.equal(persisted.id, brokenReceipt.id); assert.equal(persisted.agentId, id); assert.equal(persisted.agentVersionId, versionId);
      assert.equal(persisted.requestKey, failedKey); assert.equal(persisted.input.message, message); assert.equal(persisted.application, 'lab-draft-test');
      const patch = corruption === 'version' ? { agentVersionId: 'synthetic-wrong-version' } : { requestKey: 'synthetic-other-request' };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...persisted, ...patch }) });
    } catch (error) { rejectBinding(error); await route.abort(); }
  };
  await page.route(runPath, mismatch, { times: 1 });
  try {
    const response = page.waitForResponse(item => item.url() === path && item.request().method() === 'POST');
    void response.catch(() => {});
    await page.getByRole('button', { name: '启动草稿测试', exact: true }).click();
    const receiptResponse = await Promise.race([response, bindingFailure]);
    assert.equal(receiptResponse.request().postDataJSON().requestKey, failedKey);
    assert.equal((await receiptResponse.json()).reused, true);
    await Promise.race([bindingFailure, page.getByRole('alert').filter({ hasText: '运行启动未确认' }).waitFor()]);
    await page.waitForFunction(() => !document.querySelector('.builder-workspace > label select').disabled);
    assert.equal(await page.getByText('已读取原运行，不重复调用模型。', { exact: true }).count(), 0);
    assert.equal(await page.getByRole('heading', { name: `运行 ${brokenReceipt.id}`, exact: true }).count(), 1);
    assert.equal(await page.locator('.builder-confirm input').isChecked(), true);
    assert.equal(await page.locator('.builder-workspace textarea[maxlength="10000"]').inputValue(), message);
    assert.deepEqual(await questionInputSnapshot(), before);
    console.log(`PASS start binding ${corruption}: real reused202 and GET200 proxied mismatched field, unknown result retains original run/input/key, zero model/ledger increments`);
  } finally { await page.unroute(runPath, mismatch); }
  }
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let arrived;
  let rejected;
  const ready = new Promise((resolve, reject) => { arrived = resolve; rejected = reject; });
  void ready.catch(() => {});
  let receipt;
  let calls = 0;
  const held = async route => {
    try {
    calls++;
    assert.equal(route.request().postDataJSON().requestKey, failedKey);
    const actual = await route.fetch({ timeout: 75000 });
    assert.equal(actual.status(), 202); receipt = await actual.json();
    assert.equal(receipt.reused, true); assert.ok(receipt.id);
    arrived(); await gate; await route.fulfill({ response: actual });
    } catch (error) { rejected(error); await route.abort(); }
  };
  await page.route(path, held, { times: 1 });
  let timeout;
  try {
    await page.getByRole('button', { name: '启动草稿测试', exact: true }).click();
    await Promise.race([ready, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Actual reused start receipt missing')), 75000); })]);
    clearTimeout(timeout);
    assert.equal(await page.locator('.builder-workspace > label select').isEnabled(), false);
    assert.equal(await page.locator('.builder-workspace select').nth(1).isEnabled(), false);
    for (const name of ['新增 Agent / 工作流', '保存新版本草稿', '启动草稿测试', '准备新运行']) assert.equal(await page.getByRole('button', { name, exact: true }).isEnabled(), false);
    assert.equal(await page.getByLabel('测试输入', { exact: false }).isEnabled(), false);
    assert.equal(await page.locator('.builder-confirm input').isEnabled(), false);
    const history = page.getByRole('button', { name: / · COMPLETED$/ });
    await history.first().waitFor();
    for (const row of await history.all()) assert.equal(await row.isEnabled(), false);
    const token = await page.evaluate(() => localStorage.getItem('ia_access_token'));
    const actual = await context.request.get(`${origin}/api/agent-lab/runs/${receipt.id}`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(actual.status(), 200);
    const persisted = await actual.json(); assert.equal(persisted.status, 'COMPLETED'); assert.equal(persisted.tokenUsage.calls, 1);
    assert.deepEqual(await questionInputSnapshot(), before);
    release();
    await page.waitForFunction(() => { const select = document.querySelector('.builder-workspace > label select'); return select && !select.disabled; });
    assert.equal(calls, 1);
    assert.equal(receipt.id, brokenReceipt.id);
    assert.deepEqual(await questionInputSnapshot(), before);
    console.log('PASS start context: injected receipt refusal retains key, held actual reused202 freezes target/input/save/history, persisted run and zero model/ledger increment');
    return receipt;
  } finally { clearTimeout(timeout); release(); await page.unroute(path, held); }
}
