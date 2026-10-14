import assert from 'node:assert/strict';
import { questionInputSnapshot } from './lab-question-input-snapshot.mjs';

// Called after receipt-agent creation; metadata saves have no model calls.
export async function verifyBuilderFeedback(page, context, origin) {
  assert.equal(process.env.LAB_FIXTURE_SYNTHETIC, '1');
  assert.equal(origin, 'http://localhost:5176');
  const agentSelect = page.locator('.builder-workspace > label select');
  const id = await agentSelect.inputValue(); assert.ok(id);
  const before = await questionInputSnapshot();
  const token = await page.evaluate(() => localStorage.getItem('ia_access_token'));
  const headers = { Authorization: `Bearer ${token}` };
  const success = page.getByText('草稿已保存。正式版本未改变；请在下方选择保存的版本核验。', { exact: true });
  const read = async () => {
    const response = await context.request.get(`${origin}/api/agent-lab/agents/${id}`, { headers });
    assert.equal(response.status(), 200); return response.json();
  };
  const select = async versionId => {
    await agentSelect.selectOption(id);
    const versionSelect = page.locator('.builder-workspace select').nth(1);
    await versionSelect.locator(`option[value="${versionId}"]`).waitFor({ state: 'attached' });
    await versionSelect.selectOption(versionId);
  };
  for (const [index, action] of ['version', 'agent', 'new', 'failure'].entries()) {
    const submitted = `1.0.${index + 2}`;
    const previous = await page.locator('.builder-workspace select').nth(1).inputValue();
    await page.getByLabel('保存为版本', { exact: true }).fill(submitted);
    const savedResponse = page.waitForResponse(response => new URL(response.url()).pathname === `/api/agent-lab/agents/${id}/versions` && response.request().method() === 'POST');
    void savedResponse.catch(() => {});
    await page.getByRole('button', { name: '保存新版本草稿', exact: true }).click();
    const response = await savedResponse; assert.equal(response.status(), 201);
    const saved = await response.json(); await success.waitFor();
    await page.waitForFunction(versionId => Array.from(document.querySelectorAll('.builder-workspace select')).some(element => element.value === versionId && !element.disabled), saved.id);
    const actual = await read();
    assert.ok(actual.versions.some(row => row.id === saved.id && row.agentId === id && row.version === submitted && row.status === 'DRAFT'));
    assert.equal(actual.currentVersion, null);
    if (action === 'version') await page.locator('.builder-workspace select').nth(1).selectOption(previous);
    if (action === 'agent') { await agentSelect.selectOption(''); assert.equal(await success.count(), 0); await select(saved.id); }
    if (action === 'new') { await page.getByRole('button', { name: '新增 Agent / 工作流', exact: true }).click(); assert.equal(await success.count(), 0); await select(saved.id); }
    if (action === 'failure') {
      const path = `${origin}/api/agent-lab/agents/${id}/versions`;
      const count = actual.versions.length;
      await page.route(path, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Synthetic next save refused' }) }), { times: 1 });
      await page.getByLabel('保存为版本', { exact: true }).fill('1.0.6');
      await page.getByRole('button', { name: '保存新版本草稿', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'Synthetic next save refused' }).waitFor();
      assert.equal(await page.getByLabel('保存为版本', { exact: true }).inputValue(), '1.0.6');
      assert.equal((await read()).versions.length, count);
    }
    assert.equal(await success.count(), 0);
    assert.deepEqual(await questionInputSnapshot(), before);
  }
  console.log('PASS saved feedback ownership: actual persisted drafts, version/agent/new switches and injected next-save503 clear prior success, zero model increment');
}
