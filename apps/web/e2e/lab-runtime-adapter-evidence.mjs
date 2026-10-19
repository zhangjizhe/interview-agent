import assert from 'node:assert/strict';
import { questionInputSnapshot } from './lab-question-input-snapshot.mjs';
export async function verifyRuntimeAdapterHistory(page, context, origin) {
  assert.equal(process.env.LAB_FIXTURE_SYNTHETIC, '1'); assert.equal(origin, 'http://localhost:5176');
  const token = await page.evaluate(() => localStorage.getItem('ia_access_token'));
  const headers = { Authorization: `Bearer ${token}` };
  const before = await questionInputSnapshot();
  const response = await context.request.get(`${origin}/api/agent-lab/agents`, { headers }); assert.equal(response.status(), 200);
  const agent = (await response.json()).find(item => item.key === 'fixture-runtime-registry'); assert.ok(agent);
  const history = await context.request.get(`${origin}/api/agent-lab/runs?agentId=${agent.id}`, { headers }); assert.equal(history.status(), 200);
  const runs = await history.json(); assert.equal(runs.length, 2);
  const select = page.locator('.builder-workspace > label select');
  await select.locator(`option[value="${agent.id}"]`).waitFor({ state: 'attached' }); await select.selectOption(agent.id);
  for (const run of runs) {
    const detail = await context.request.get(`${origin}/api/agent-lab/runs/${run.id}`, { headers }); assert.equal(detail.status(), 200);
    const persisted = await detail.json(); assert.equal(persisted.status, 'COMPLETED'); assert.match(persisted.output.response, /^synthetic:fixture-adapter-(one|two)$/);
    await page.getByRole('button', { name: `${run.id} · COMPLETED`, exact: true }).click();
    await page.getByRole('heading', { name: `运行 ${run.id}`, exact: true }).waitFor();
    await page.getByText(`运行 Agent：fixture-runtime-registry · 固定版本：${persisted.agentVersion.version}`, { exact: true }).waitFor();
    await page.locator('.builder-workspace pre').filter({ hasText: persisted.output.response }).waitFor();
    await page.locator('.builder-workspace li').filter({ hasText: 'turn.start' }).waitFor();
    await page.locator('.builder-workspace li').filter({ hasText: 'turn.end' }).waitFor();
    assert.equal(await page.getByRole('button', { name: '取消运行', exact: true }).isEnabled(), false);
  }
  assert.deepEqual(await questionInputSnapshot(), before); await select.selectOption('');
  console.log('PASS adapter history browser: two construction-registered synthetic engines persist exact output/version/Trace in existing UI, no provider/ledger increments; not production plugins');
}
