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
  const runs = await history.json(); assert.equal(runs.length, 3);
  const select = page.locator('.builder-workspace > label select');
  await select.locator(`option[value="${agent.id}"]`).waitFor({ state: 'attached' }); await select.selectOption(agent.id);
  for (const run of runs) {
    const detail = await context.request.get(`${origin}/api/agent-lab/runs/${run.id}`, { headers }); assert.equal(detail.status(), 200);
    const persisted = await detail.json();
    assert.ok(['COMPLETED', 'FAILED'].includes(persisted.status));
    await page.getByRole('button', { name: `${run.id} · ${persisted.status}`, exact: true }).click();
    await page.getByRole('heading', { name: `运行 ${run.id}`, exact: true }).waitFor();
    await page.getByText(`运行 Agent：fixture-runtime-registry · 固定版本：${persisted.agentVersion.version}`, { exact: true }).waitFor();
    if (persisted.status === 'FAILED') {
      assert.equal(persisted.output, null); assert.equal(persisted.estimatedCost, 0.012); assert.equal(persisted.tokenUsage.calls, 1);
      await page.getByRole('alert').filter({ hasText: '运行适配器最终输出无效' }).waitFor();
      await page.getByText('估算费用：0.012 CNY · 调用次数：1', { exact: true }).waitFor();
      await page.locator('.builder-workspace li').filter({ hasText: 'run.failed' }).waitFor();
      assert.equal(await page.locator('.builder-workspace pre').count(), 0);
    } else {
      assert.match(persisted.output.response, /^synthetic:fixture-adapter-(one|two)$/);
      await page.locator('.builder-workspace pre').filter({ hasText: persisted.output.response }).waitFor();
      await page.locator('.builder-workspace li').filter({ hasText: 'turn.end' }).waitFor();
    }
    await page.locator('.builder-workspace li').filter({ hasText: 'turn.start' }).waitFor();
    assert.equal(await page.getByRole('button', { name: '取消运行', exact: true }).isEnabled(), false);
  }
  assert.deepEqual(await questionInputSnapshot(), before); await select.selectOption('');
  console.log('PASS adapter history browser: two valid engines and one invalid output persist exact terminal/output/version/Trace and reported estimate in existing UI, no provider/ledger increments; not production plugins');
}
