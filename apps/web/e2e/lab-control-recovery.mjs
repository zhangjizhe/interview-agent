import assert from 'node:assert/strict';

// Called only by the authorized, same-origin synthetic Docker browser fixture.
export async function verifyControlRecovery(page, context, origin) {
  assert.equal(process.env.LAB_FIXTURE_SYNTHETIC, '1');
  assert.equal(origin, 'http://localhost:5176');
  const originalSession = await page.evaluate(() => ({ token: localStorage.getItem('ia_access_token'), role: localStorage.getItem('ia_user_role') }));
  assert.ok(originalSession.token);
  let loginCalls = 0;
  const observeLogin = request => { if (request.url().endsWith('/api/auth/login')) loginCalls += 1; };
  page.on('request', observeLogin);
  // Explicit browser proxy fault injection; this is not a natural API failure.
  const dashboardPattern = '**/api/agent-lab/dashboard';
  await page.route(dashboardPattern, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'synthetic-control-plane-unavailable' }) }));
  await page.reload();
  await page.getByRole('heading', { name: '无法读取控制面', exact: true }).waitFor({ timeout: 30000 });
  assert.equal(await page.getByRole('button', { name: '登录控制台', exact: true }).count(), 0);
  assert.deepEqual(await page.evaluate(() => ({ token: localStorage.getItem('ia_access_token'), role: localStorage.getItem('ia_user_role') })), originalSession);
  const profile = await context.request.get(`${origin}/api/auth/profile`, { headers: { Authorization: `Bearer ${originalSession.token}` } });
  assert.equal(profile.status(), 200);
  await page.unroute(dashboardPattern);
  const recovered = page.waitForResponse(response => response.url().endsWith('/api/agent-lab/dashboard') && response.ok());
  await page.getByRole('button', { name: '重试连接', exact: true }).click();
  await recovered;
  await page.getByRole('heading', { name: '控制中心', level: 1, exact: true }).waitFor();
  assert.equal(loginCalls, 0);
  page.off('request', observeLogin);
  console.log('PASS control recovery: injected 503 preserves authenticated session, real API retry restores dashboard');

  let reloadCalls = 0;
  const observeReload = request => { if (request.url().endsWith('/api/admin/mcp-servers/reload') && request.method() === 'POST') reloadCalls += 1; };
  page.on('request', observeReload);
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: '重新加载 MCP', exact: true }).click();
  assert.equal(reloadCalls, 0);
  assert.equal(await page.getByText('MCP 配置已重新加载。', { exact: true }).count(), 0);
  const headers = { Authorization: `Bearer ${originalSession.token}` };
  const before = await (await context.request.get(`${origin}/api/admin/mcp-servers`, { headers })).json();
  let releaseResponse;
  const gate = new Promise(resolve => { releaseResponse = resolve; });
  const reloadPattern = '**/api/admin/mcp-servers/reload';
  await page.route(reloadPattern, async route => {
    const response = await route.fetch(); // real POST, hold delivery only
    await gate;
    await route.fulfill({ response });
  });
  page.once('dialog', dialog => dialog.accept());
  const completed = page.waitForResponse(response => response.url().endsWith('/api/admin/mcp-servers/reload') && response.ok());
  await page.getByRole('button', { name: '重新加载 MCP', exact: true }).click();
  try {
    await page.getByRole('button', { name: '重载中', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: '重载中', exact: true }).isDisabled(), true);
  } finally { releaseResponse(); }
  const receipt = await (await completed).json();
  assert.equal(receipt.ok, true);
  await page.getByText('MCP 配置已重新加载。', { exact: true }).waitFor();
  assert.equal(reloadCalls, 1);
  const after = await (await context.request.get(`${origin}/api/admin/mcp-servers`, { headers })).json();
  const binding = data => data.servers.map(server => ({ name: server.name, enabled: server.enabled, executable: server.executable })).sort((a, b) => a.name.localeCompare(b.name));
  assert.deepEqual(binding(after), binding(before));
  await page.unroute(reloadPattern);
  page.off('request', observeReload);
  console.log('PASS MCP reload: cancel sends no POST, confirm sends one real POST, pending disabled and bindings retained');
}
