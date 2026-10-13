import assert from 'node:assert/strict';
import { questionInputSnapshot } from './lab-question-input-snapshot.mjs';

export async function verifyBuilderSaveReceipt(page, context, origin) {
  assert.equal(process.env.LAB_FIXTURE_SYNTHETIC, '1');
  assert.equal(origin, 'http://localhost:5176');
  const before = await questionInputSnapshot();
  const token = await page.evaluate(() => localStorage.getItem('ia_access_token'));
  const headers = { Authorization: `Bearer ${token}` };
  let posts = 0;
  const observe = request => { if (request.method() === 'POST' && /\/(configured-agents|versions)$/.test(new URL(request.url()).pathname)) posts++; };
  page.on('request', observe);
  const corrupt = async (path, button) => {
    let actual;
    const pattern = `${origin}/api${path}`;
    const handler = async route => {
      const response = await route.fetch({ timeout: 75000 });
      assert.equal(response.status(), 201); actual = await response.json();
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    };
    await page.route(pattern, handler, { times: 1 });
    try {
      const response = page.waitForResponse(item => item.url() === pattern && item.request().method() === 'POST');
      void response.catch(() => {});
      await page.getByRole('button', { name: button, exact: true }).click();
      assert.equal((await response).status(), 200);
      await page.getByRole('alert').filter({ hasText: '草稿保存未确认' }).waitFor();
      await page.waitForFunction(() => { const submit = document.querySelector('.builder-workspace form button[type="submit"]'); return submit && !submit.disabled; });
      assert.equal(await page.getByText('草稿已保存。正式版本未改变；请在下方选择保存的版本核验。', { exact: true }).count(), 0);
      assert.deepEqual(await questionInputSnapshot(), before);
      return actual;
    } finally { await page.unroute(pattern, handler); }
  };
  const read = async id => {
    const response = await context.request.get(`${origin}/api/agent-lab/agents/${id}`, { headers });
    assert.equal(response.status(), 200); return response.json();
  };
  const reloadSelect = async (id, versionId) => {
    await page.reload();
    await page.getByRole('button', { name: '运行编排', exact: true }).click();
    await page.getByRole('option', { name: 'browser-receipt-agent · browser-receipt-agent', exact: true }).waitFor({ state: 'attached' });
    await page.locator('.builder-workspace > label select').selectOption(id);
    await page.locator('.builder-workspace select').nth(1).locator(`option[value="${versionId}"]`).waitFor({ state: 'attached' });
    await page.locator('.builder-workspace select').nth(1).selectOption(versionId);
  };
  try {
    await page.getByRole('button', { name: '新增 Agent / 工作流', exact: true }).click();
    await page.getByLabel('名称', { exact: true }).fill('browser-receipt-agent');
    await page.getByLabel('唯一 key', { exact: true }).fill('browser-receipt-agent');
    await page.locator('.builder-workspace form textarea[rows="6"]').fill('receipt-first');
    const created = await corrupt('/agent-lab/configured-agents', '创建并保存初始草稿');
    assert.equal(await page.getByLabel('名称', { exact: true }).inputValue(), 'browser-receipt-agent');
    assert.equal(await page.locator('.builder-workspace form textarea[rows="6"]').inputValue(), 'receipt-first');
    const first = await read(created.id);
    assert.equal(first.name, 'browser-receipt-agent'); assert.equal(first.key, 'browser-receipt-agent');
    assert.equal(first.versions[0].id, created.versions[0].id);
    assert.equal(first.versions[0].systemPrompt, 'receipt-first');
    assert.equal(first.currentVersion, null);
    assert.equal(posts, 1);
    await reloadSelect(created.id, created.versions[0].id);
    assert.equal(await page.locator('.builder-workspace form textarea[rows="6"]').inputValue(), 'receipt-first');
    await page.getByLabel('保存为版本', { exact: true }).fill('1.0.1');
    await page.locator('.builder-workspace form textarea[rows="6"]').fill('receipt-second');
    const saved = await corrupt(`/agent-lab/agents/${created.id}/versions`, '保存新版本草稿');
    assert.equal(await page.locator('.builder-workspace select').nth(1).inputValue(), created.versions[0].id);
    assert.equal(await page.locator('.builder-workspace form textarea[rows="6"]').inputValue(), 'receipt-second');
    const second = await read(created.id);
    const version = second.versions.find(item => item.id === saved.id);
    assert.ok(version); assert.equal(version.agentId, created.id); assert.equal(version.version, '1.0.1');
    assert.equal(version.status, 'DRAFT'); assert.equal(version.systemPrompt, 'receipt-second');
    assert.equal(second.currentVersion, null); assert.equal(posts, 2);
    await reloadSelect(created.id, saved.id);
    assert.equal(await page.locator('.builder-workspace form textarea[rows="6"]').inputValue(), 'receipt-second');
    assert.deepEqual(await questionInputSnapshot(), before);
    console.log('PASS builder malformed save receipts: real create/version201 proxied200 empty body, draft/selection retained, real GET/reload persisted IDs/prompts, zero model increment');
  } finally { page.off('request', observe); }
}
