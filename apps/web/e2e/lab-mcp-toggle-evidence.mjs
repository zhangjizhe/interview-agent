import assert from 'node:assert/strict';
import { questionInputSnapshot } from './lab-question-input-snapshot.mjs';

// Only the private synthetic Docker API; select a builtin without external probes.
export async function verifyMcpToggle(page, context, origin) {
  assert.equal(process.env.LAB_FIXTURE_SYNTHETIC, '1');
  assert.equal(origin, 'http://localhost:5176');
  const token = await page.evaluate(() => localStorage.getItem('ia_access_token'));
  const headers = { Authorization: `Bearer ${token}` };
  const read = async () => {
    const response = await context.request.get(`${origin}/api/admin/mcp-servers`, { headers });
    assert.equal(response.status(), 200); return response.json();
  };
  const before = await questionInputSnapshot();
  const original = await read();
  const server = original.servers.find(item => item.builtin && item.enabled && item.executable);
  assert.ok(server, 'An enabled executable builtin is required');
  const row = page.locator('.mcp-row').filter({ has: page.getByRole('heading', { name: server.displayName || server.name, exact: true }) });
  const path = `${origin}/api/admin/mcp-servers/toggle`;
  const failure = page.getByText('Synthetic MCP toggle refused', { exact: false });
  await page.route(path, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Synthetic MCP toggle refused' }) }), { times: 1 });
  await row.getByRole('button', { name: '系统关闭', exact: true }).click();
  await failure.waitFor();
  assert.equal((await read()).servers.find(item => item.name === server.name).enabled, true);
  assert.deepEqual(await questionInputSnapshot(), before);
  let rejectBroken;
  const brokenFailure = new Promise((_, reject) => { rejectBroken = reject; });
  void brokenFailure.catch(() => {});
  const broken = async route => {
    try {
      const actual = await route.fetch({ timeout: 75000 }); assert.equal(actual.status(), 201);
      assert.deepEqual(await actual.json(), { ok: true, toolName: server.name, enabled: false });
      await route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
    } catch (error) { rejectBroken(error); await route.abort(); }
  };
  await page.route(path, broken, { times: 1 });
  try {
    await row.getByRole('button', { name: '系统关闭', exact: true }).click();
    await Promise.race([brokenFailure, page.getByText('MCP 开关结果未确认，请重新读取服务状态后核验。', { exact: false }).waitFor()]);
    assert.equal((await read()).servers.find(item => item.name === server.name).enabled, false);
    assert.equal(await page.getByText(`${server.name} 已更新。`, { exact: true }).count(), 0);
    assert.deepEqual(await questionInputSnapshot(), before);
    console.log('PASS MCP receipt: real disable201 proxied201{} reports unknown despite persisted runtime state, no false success or provider/ledger increment');
  } catch (error) {
    try {
      const restored = await context.request.post(path, { headers, data: { toolName: server.name, enabled: true } });
      if (restored.status() !== 201) console.error('MCP broken-receipt cleanup could not restore state');
    } catch { console.error('MCP broken-receipt cleanup failed after original error'); }
    throw error;
  } finally { await page.unroute(path, broken); }
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let arrived; let rejected;
  const ready = new Promise((resolve, reject) => { arrived = resolve; rejected = reject; });
  void ready.catch(() => {});
  const held = async route => {
    try {
      assert.deepEqual(route.request().postDataJSON(), { toolName: server.name, enabled: false });
      const actual = await route.fetch({ timeout: 75000 }); assert.equal(actual.status(), 201);
      assert.deepEqual(await actual.json(), { ok: true, toolName: server.name, enabled: false });
      arrived(); await gate; await route.fulfill({ response: actual });
    } catch (error) { rejected(error); await route.abort(); }
  };
  await page.route(path, held, { times: 1 });
  let timeout; let failed = false;
  try {
    await row.getByRole('button', { name: '系统关闭', exact: true }).click();
    await Promise.race([ready, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('MCP toggle receipt missing')), 75000); })]);
    clearTimeout(timeout);
    assert.equal(await row.getByRole('button', { name: '处理中', exact: true }).isEnabled(), false);
    const disabled = await read();
    assert.equal(disabled.servers.find(item => item.name === server.name).enabled, false);
    assert.equal(disabled.runningCount, original.runningCount - 1);
    release();
    await row.getByRole('button', { name: '系统启用', exact: true }).waitFor();
    const healthResponse = page.waitForResponse(response => response.url() === `${origin}/api/admin/mcp-servers/${server.name}/health`);
    void healthResponse.catch(() => {});
    await row.getByRole('button', { name: '健康检查', exact: true }).click();
    const health = await healthResponse; assert.equal(health.status(), 200);
    assert.equal((await health.json()).ok, false);
    await page.getByText(`${server.name} 未通过检查：工具已被系统禁用`, { exact: true }).waitFor();
    const enabledResponse = page.waitForResponse(response => response.url() === path && response.request().method() === 'POST');
    void enabledResponse.catch(() => {});
    await row.getByRole('button', { name: '系统启用', exact: true }).click();
    assert.equal((await enabledResponse).status(), 201);
    await row.getByRole('button', { name: '系统关闭', exact: true }).waitFor();
    const restored = await read();
    assert.equal(restored.servers.find(item => item.name === server.name).enabled, true);
    assert.equal(restored.runningCount, original.runningCount);
    assert.deepEqual(await questionInputSnapshot(), before);
    console.log('PASS MCP runtime toggle: refused503 retains state, held actual201 disables row, API list/count and disabled builtin health agree, explicit re-enable restores state with zero provider/ledger increments');
  } catch (error) { failed = true; throw error; } finally {
    clearTimeout(timeout); release();
    try {
      await page.unroute(path, held);
      if (!(await read()).servers.find(item => item.name === server.name).enabled) {
        const restored = await context.request.post(path, { headers, data: { toolName: server.name, enabled: true } });
        assert.equal(restored.status(), 201);
      }
    } catch (error) { if (!failed) throw error; console.error('MCP synthetic cleanup failed after original error'); }
  }
}
