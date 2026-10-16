import assert from 'node:assert/strict';
import { fixtureModelHold } from './lab-fixture-model-hold.mjs';
import { questionInputSnapshot } from './lab-question-input-snapshot.mjs';

export async function verifyBuilderCancellation(page, context, origin, previous) {
  assert.equal(process.env.LAB_FIXTURE_SYNTHETIC, '1');
  assert.equal(origin, 'http://localhost:5176');
  const before = await questionInputSnapshot();
  const token = await page.evaluate(() => localStorage.getItem('ia_access_token'));
  const headers = { Authorization: `Bearer ${token}` };
  const agentId = await page.locator('.builder-workspace > label select').inputValue();
  const agentResponse = await context.request.get(`${origin}/api/agent-lab/agents/${agentId}`, { headers });
  assert.equal(agentResponse.status(), 200);
  const definition = (await agentResponse.json()).versions.find(item => item.version === '1.0.0');
  assert.ok(definition);
  const versions = page.locator('.builder-workspace select').nth(1);
  await versions.selectOption(definition.id);
  assert.equal(await page.getByRole('heading', { name: `运行 ${previous.id}`, exact: true }).count(), 0);
  await page.getByRole('button', { name: `${previous.id} · COMPLETED`, exact: true }).click();
  await page.getByRole('heading', { name: `运行 ${previous.id}`, exact: true }).waitFor();
  await versions.selectOption(definition.id);
  assert.equal(await page.getByRole('heading', { name: `运行 ${previous.id}`, exact: true }).count(), 0);
  await page.getByRole('button', { name: '准备新运行', exact: true }).click();
  await page.getByLabel('测试输入', { exact: false }).fill('fixture-hold-cancel');
  await page.locator('.builder-confirm input').check();
  const start = page.waitForResponse(response => /\/test-runs$/.test(new URL(response.url()).pathname) && response.request().method() === 'POST');
  void start.catch(() => {});
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let timeout;
  let heldPattern;
  let handler;
  let failed = false;
  try {
    await page.getByRole('button', { name: '启动草稿测试', exact: true }).click();
    const accepted = await start; assert.equal(accepted.status(), 202);
    const run = await accepted.json(); assert.notEqual(run.id, previous.id);
    const read = async () => {
      const response = await context.request.get(`${origin}/api/agent-lab/runs/${run.id}`, { headers });
      assert.equal(response.status(), 200); return response.json();
    };
    const deadline = Date.now() + 30000;
    while (!(await fixtureModelHold('state')).waiting) {
      assert.ok(Date.now() < deadline, 'Actual fixture model call did not enter hold');
      await page.waitForTimeout(100);
    }
    assert.equal((await read()).status, 'RUNNING');
    await page.getByRole('button', { name: '取消运行', exact: true }).waitFor();
    await page.waitForFunction(() => Array.from(document.querySelectorAll('.builder-workspace button')).some(button => button.textContent === '取消运行' && !button.disabled));
    const active = await questionInputSnapshot();
    assert.equal(active.provider.chat, before.provider.chat + 1);
    const createdVersion = await context.request.post(`${origin}/api/agent-lab/agents/${agentId}/versions`, {
      headers,
      data: { version: '1.0.1', systemPrompt: definition.systemPrompt, modelConfig: definition.modelConfig,
        runtimeConfig: definition.runtimeConfig, inputSchema: definition.inputSchema, outputSchema: definition.outputSchema },
    });
    assert.equal(createdVersion.status(), 201);
    const otherVersion = await createdVersion.json();
    assert.equal(otherVersion.agentId, agentId); assert.equal(otherVersion.version, '1.0.1');
    const agentSelect = page.locator('.builder-workspace > label select');
    await agentSelect.selectOption('');
    assert.equal(await page.getByRole('heading', { name: `运行 ${run.id}`, exact: true }).count(), 0);
    assert.equal((await read()).status, 'RUNNING');
    const reloadAgent = page.waitForResponse(response => new URL(response.url()).pathname === `/api/agent-lab/agents/${agentId}` && response.request().method() === 'GET');
    void reloadAgent.catch(() => {});
    await agentSelect.selectOption(agentId);
    assert.equal((await reloadAgent).status(), 200);
    await versions.locator(`option[value="${otherVersion.id}"]`).waitFor({ state: 'attached' });
    await versions.selectOption(otherVersion.id);
    await page.getByRole('heading', { name: '受控测试 · 1.0.1 · DRAFT', exact: true }).waitFor();
    assert.equal(await page.getByRole('heading', { name: `运行 ${run.id}`, exact: true }).count(), 0);
    const pinned = await read();
    assert.equal(pinned.status, 'RUNNING'); assert.equal(pinned.agentVersionId, definition.id);
    assert.equal(pinned.agentVersion.version, '1.0.0'); assert.equal(pinned.cancelRequestedAt, null);
    await page.getByRole('button', { name: `${run.id} · RUNNING`, exact: true }).click();
    await page.getByRole('heading', { name: `运行 ${run.id}`, exact: true }).waitFor();
    await page.getByText('运行 Agent：browser-ci-agent · 固定版本：1.0.0', { exact: true }).waitFor();
    assert.equal(await versions.inputValue(), otherVersion.id);
    assert.deepEqual(await questionInputSnapshot(), active);
    console.log('PASS RUNNING history provenance: actual draft1.0.1 editor, original run stays1.0.0, history restores its controls without new model work');
    const path = `${origin}/api/agent-lab/runs/${run.id}/cancel`;
    await page.route(path, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Synthetic cancel refused' }) }), { times: 1 });
    await page.getByRole('button', { name: '取消运行', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Synthetic cancel refused' }).waitFor();
    await page.waitForFunction(() => Array.from(document.querySelectorAll('.builder-workspace button')).some(button => button.textContent === '取消运行' && !button.disabled));
    assert.equal((await read()).cancelRequestedAt, null);
    assert.deepEqual(await questionInputSnapshot(), active);
    let brokenReceipt;
    let rejectBroken;
    const brokenFailure = new Promise((_, reject) => { rejectBroken = reject; });
    void brokenFailure.catch(() => {});
    await page.route(path, async route => {
      try {
        const actual = await route.fetch({ timeout: 75000 });
        brokenReceipt = { status: actual.status(), body: await actual.json() };
        await route.fulfill({ status: actual.status(), contentType: 'application/json', body: '{}' });
      } catch (error) { rejectBroken(error); await route.abort(); }
    }, { times: 1 });
    await page.getByRole('button', { name: '取消运行', exact: true }).click();
    await Promise.race([brokenFailure, page.getByRole('alert').filter({ hasText: '取消结果未确认，请刷新运行状态后核验。' }).waitFor()]);
    assert.equal(brokenReceipt.status, 201);
    assert.equal(brokenReceipt.body.id, run.id);
    assert.ok(brokenReceipt.body.cancelRequestedAt);
    assert.equal((await read()).cancelRequestedAt, brokenReceipt.body.cancelRequestedAt);
    assert.equal(await page.getByText('取消已请求；在途调用仍需结算，后续节点停止。', { exact: true }).count(), 0);
    await page.waitForFunction(() => Array.from(document.querySelectorAll('.builder-workspace button')).some(button => button.textContent === '取消运行' && !button.disabled));
    assert.deepEqual(await questionInputSnapshot(), active);
    console.log('PASS cancel receipt integrity: actual201 records flag, proxy201{} shows unknown result and retains explicit retry without model or ledger increments');
    let arrived;
    let rejected;
    const ready = new Promise((resolve, reject) => { arrived = resolve; rejected = reject; });
    void ready.catch(() => {});
    handler = async route => {
      try {
        const actual = await route.fetch({ timeout: 75000 }); assert.equal(actual.status(), 201);
        const receipt = await actual.json(); assert.ok(receipt.cancelRequestedAt);
        arrived(); await gate; await route.fulfill({ response: actual });
      } catch (error) { rejected(error); await route.abort(); }
    };
    heldPattern = path;
    await page.route(path, handler, { times: 1 });
    await page.getByRole('button', { name: '取消运行', exact: true }).click();
    await Promise.race([ready, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Actual cancel receipt missing')), 75000); })]);
    clearTimeout(timeout);
    assert.equal((await read()).cancelRequestedAt, brokenReceipt.body.cancelRequestedAt);
    assert.equal(await page.locator('.builder-workspace > label select').isEnabled(), false);
    assert.equal(await versions.isEnabled(), false);
    for (const name of ['新增 Agent / 工作流', '保存新版本草稿', '取消运行']) assert.equal(await page.getByRole('button', { name, exact: true }).isEnabled(), false);
    for (const button of await page.getByRole('button', { name: / · (COMPLETED|RUNNING)$/ }).all()) assert.equal(await button.isEnabled(), false);
    assert.deepEqual(await questionInputSnapshot(), active);
    release();
    await page.getByText('取消已请求；在途调用仍需结算，后续节点停止。', { exact: true }).waitFor();
    await fixtureModelHold('release');
    let terminal;
    const finish = Date.now() + 30000;
    do { terminal = await read(); if (terminal.status === 'CANCELLED') break; assert.ok(Date.now() < finish, 'Cancelled run did not settle'); await page.waitForTimeout(100); } while (true);
    await page.getByText(/^状态：CANCELLED ·/).waitFor();
    const after = await questionInputSnapshot();
    assert.equal(after.provider.chat, before.provider.chat + 1);
    assert.equal(after.ledger, before.ledger + 1);
    for (const key of ['embedding', 'rerank', 'externalRequests']) assert.equal(after.provider[key], before.provider[key]);
    assert.equal(after.provider.externalRequests, 0);
    assert.equal(terminal.cancelRequestedAt != null, true);
    assert.equal(terminal.agentVersionId, definition.id); assert.equal(terminal.agentVersion.version, '1.0.0');
    assert.equal((await fixtureModelHold('state')).waiting, false);
    console.log('PASS actual cancellation: RUNNING model held, refusal preserves state, held real cancel freezes context, release settles CANCELLED with one billed synthetic call; version clears old run and history restores it');
  } catch (error) { failed = true; throw error; } finally {
    clearTimeout(timeout); release();
    let cleanupError;
    try { if (heldPattern) await page.unroute(heldPattern, handler); } catch (error) { cleanupError = error; }
    try { await fixtureModelHold('release'); } catch (error) { cleanupError ??= error; }
    if (cleanupError && !failed) throw cleanupError;
    if (cleanupError) console.error('Synthetic cancellation cleanup failed after original error');
  }
}
