import assert from 'node:assert/strict';
import { questionInputSnapshot } from './lab-question-input-snapshot.mjs';

// Reads logs created by the real MCP reload in this private fixture.
export async function verifyOperationLogs(page, context, origin) {
  assert.equal(process.env.LAB_FIXTURE_SYNTHETIC, '1');
  assert.equal(origin, 'http://localhost:5176');
  const token = await page.evaluate(() => localStorage.getItem('ia_access_token'));
  const headers = { Authorization: `Bearer ${token}` };
  const before = await questionInputSnapshot();
  const logUrl = pageNumber => `${origin}/api/agent-lab/operation-logs?page=${pageNumber}&limit=20&action=MCP_CONFIG_RELOAD&outcome=SUCCEEDED&objectType=MCP_REGISTRY`;
  const initialResponse = await context.request.get(logUrl(1), { headers }); assert.equal(initialResponse.status(), 200);
  const initial = await initialResponse.json(); assert.ok(initial.total >= 1 && initial.total <= 21);
  for (let index = initial.total; index < 21; index++) {
    const reload = await context.request.post(`${origin}/api/admin/mcp-servers/reload`, { headers });
    assert.equal(reload.status(), 201); assert.equal((await reload.json()).ok, true);
  }

  await page.getByRole('button', { name: '操作日志', exact: true }).click();
  await page.getByRole('heading', { name: '操作日志', level: 1, exact: true }).waitFor();
  const filters = { action: '', outcome: '', objectType: '' };
  const select = async (label, field, value) => {
    filters[field] = value;
    const response = page.waitForResponse(item => {
      const url = new URL(item.url());
      return url.pathname === '/api/agent-lab/operation-logs' && url.searchParams.get('page') === '1'
        && Object.entries(filters).every(([key, expected]) => (url.searchParams.get(key) || '') === expected);
    });
    void response.catch(() => {});
    await page.getByLabel(label, { exact: true }).selectOption(value);
    const actual = await response; assert.equal(actual.status(), 200); return actual.json();
  };
  await select('Operation action', 'action', 'MCP_CONFIG_RELOAD');
  await select('Operation outcome', 'outcome', 'SUCCEEDED');
  const receipt = await select('Operation object type', 'objectType', 'MCP_REGISTRY');
  const persistedResponse = await context.request.get(`${origin}/api/agent-lab/operation-logs?page=1&limit=20&action=MCP_CONFIG_RELOAD&outcome=SUCCEEDED&objectType=MCP_REGISTRY`, { headers });
  assert.equal(persistedResponse.status(), 200);
  const persisted = await persistedResponse.json();
  assert.deepEqual(receipt, persisted);
  assert.ok(persisted.items.length > 0, 'Actual reload must have persisted an operation log');
  assert.deepEqual(persisted.filters, { action: 'MCP_CONFIG_RELOAD', outcome: 'SUCCEEDED', objectType: 'MCP_REGISTRY', from: null, to: null });
  const waitRows = async items => page.waitForFunction(expected => {
    const current = Array.from(document.querySelectorAll('.lab-list > .lab-row'));
    return current.length === expected.length && expected.every((item, index) => {
      const text = current[index].textContent;
      return text.includes(`${item.action} / ${item.outcome}`) && text.includes(item.objectId)
        && text.includes(`管理员 ${item.actorId} · ${new Date(item.createdAt).toLocaleString()}`);
    });
  }, items);
  const rows = page.locator('.lab-list > .lab-row');
  await waitRows(persisted.items);
  assert.equal(await rows.count(), persisted.items.length);
  for (const [index, item] of persisted.items.entries()) {
    assert.equal(item.action, 'MCP_CONFIG_RELOAD'); assert.equal(item.outcome, 'SUCCEEDED'); assert.equal(item.objectType, 'MCP_REGISTRY');
    assert.equal(item.objectId, 'system-mcp-registry'); assert.ok(item.actorId); assert.ok(Number.isFinite(Date.parse(item.createdAt)));
    const row = rows.nth(index);
    assert.equal(await row.locator('.agent-eyebrow').innerText(), `${item.action} / ${item.outcome}`);
    assert.equal(await row.locator('h2 span').innerText(), item.objectId);
    assert.equal(await row.locator('h2').innerText(), `${item.objectType} ${item.objectId}`);
    const expectedDate = await page.evaluate(value => new Date(value).toLocaleString(), item.createdAt);
    assert.equal(await row.locator('p').last().innerText(), `管理员 ${item.actorId} · ${expectedDate}`);
  }
  assert.equal(await page.locator('.lab-pagination span').innerText(), `${persisted.total} 条`);
  assert.equal(await page.getByRole('button', { name: '上一页', exact: true }).isEnabled(), false);
  assert.equal(await page.getByRole('button', { name: '下一页', exact: true }).isEnabled(), persisted.hasMore);
  assert.equal(persisted.total, 21); assert.equal(persisted.items.length, 20); assert.equal(persisted.hasMore, true);
  const turn = async (name, pageNumber) => {
    const response = page.waitForResponse(item => item.url() === logUrl(pageNumber));
    void response.catch(() => {});
    const button = page.getByRole('button', { name, exact: true });
    await button.focus(); await button.press('Enter');
    const actual = await response; assert.equal(actual.status(), 200); const data = await actual.json();
    const readback = await context.request.get(logUrl(pageNumber), { headers }); assert.equal(readback.status(), 200);
    assert.deepEqual(data, await readback.json()); await waitRows(data.items);
    return data;
  };
  const second = await turn('下一页', 2);
  assert.equal(second.page, 2); assert.equal(second.total, 21); assert.equal(second.items.length, 1); assert.equal(second.hasMore, false);
  assert.equal(new Set([...persisted.items, ...second.items].map(item => item.id)).size, 21);
  assert.equal(await page.getByRole('button', { name: '下一页', exact: true }).isEnabled(), false);
  assert.equal(await page.getByRole('button', { name: '上一页', exact: true }).isEnabled(), true);
  const firstAgain = await turn('上一页', 1); assert.deepEqual(firstAgain, persisted);
  assert.equal(await page.getByRole('button', { name: '上一页', exact: true }).isEnabled(), false);
  await turn('下一页', 2);
  const empty = await select('Operation action', 'action', 'EXPERIMENT_CREATE');
  assert.equal(empty.total, 0); assert.deepEqual(empty.items, []);
  await page.getByRole('heading', { name: '没有匹配的操作日志', exact: true }).waitFor();
  assert.equal(await rows.count(), 0);
  const recovered = await select('Operation action', 'action', 'MCP_CONFIG_RELOAD');
  assert.deepEqual(recovered, persisted);
  await waitRows(persisted.items);
  assert.equal(await rows.count(), persisted.items.length);
  assert.deepEqual(await questionInputSnapshot(), before);
  await page.getByRole('button', { name: '控制中心', exact: true }).click();
  console.log('PASS operation log: actual persisted reload log fields/date/actor/total and keyboard page1/page2 traversal match UI; AND filters produce empty state and explicit selection restores rows, zero provider/ledger increments');
}
