import assert from 'node:assert/strict';
import { questionInputSnapshot } from './lab-question-input-snapshot.mjs';

export async function verifyUserPermission(browser, origin) {
  assert.equal(process.env.LAB_FIXTURE_SYNTHETIC, '1');
  assert.equal(origin, 'http://localhost:5176');
  const before = await questionInputSnapshot();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  try {
    await page.goto(origin);
    await page.getByLabel('用户名', { exact: true }).fill('fixture-ci-owner');
    await page.getByLabel('密码', { exact: true }).fill('isolated-fixture-password');
    const response = page.waitForResponse(item => new URL(item.url()).pathname === '/api/auth/login' && item.request().method() === 'POST');
    void response.catch(() => {});
    await page.getByRole('button', { name: '登录控制台', exact: true }).click();
    const actual = await response;
    assert.equal(actual.status(), 200);
    const receipt = await actual.json();
    assert.equal(receipt.role, 'USER'); assert.ok(receipt.accessToken);
    await page.getByText('账号登录成功，但当前账号尚未获得 Agent Lab 管理员权限。', { exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => ['ia_access_token', 'ia_user_role', 'ia_userId'].map(key => localStorage.getItem(key))), [null, null, null]);
    assert.equal(await page.getByRole('navigation', { name: 'Agent Lab 导航', exact: true }).count(), 0);
    const headers = { Authorization: `Bearer ${receipt.accessToken}` };
    assert.equal((await context.request.get(`${origin}/api/agent-lab/dashboard`, { headers })).status(), 403);
    assert.equal((await context.request.post(`${origin}/api/admin/mcp-servers/reload`, { headers })).status(), 403);
    await page.evaluate(token => { localStorage.setItem('ia_access_token', token); localStorage.setItem('ia_user_role', 'ADMIN'); localStorage.setItem('ia_userId', 'fixture-ci-owner'); }, receipt.accessToken);
    const denied = page.waitForResponse(item => new URL(item.url()).pathname === '/api/agent-lab/dashboard' && item.status() === 403);
    void denied.catch(() => {});
    await page.reload(); await denied;
    await page.getByRole('heading', { name: '无法读取控制面', exact: true }).waitFor({ timeout: 30000 });
    assert.equal(await page.getByRole('navigation', { name: 'Agent Lab 导航', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: '重新加载 MCP', exact: true }).count(), 0);
    assert.deepEqual(await questionInputSnapshot(), before);
    console.log('PASS real USER login denied by Lab; forged local ADMIN remains real403 with no control UI or provider/ledger increment');
  } finally { await context.close(); }
}
