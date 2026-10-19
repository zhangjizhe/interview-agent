import assert from 'node:assert/strict';
import { questionInputSnapshot } from './lab-question-input-snapshot.mjs';
export async function verifyExternalInitialization(page, context, origin) {
  assert.equal(process.env.LAB_FIXTURE_SYNTHETIC, '1'); assert.equal(origin, 'http://localhost:5176');
  const token = await page.evaluate(() => localStorage.getItem('ia_access_token'));
  const headers = { Authorization: `Bearer ${token}` };
  const before = await questionInputSnapshot();
  const agentsResponse = await context.request.get(`${origin}/api/agent-lab/agents`, { headers }); assert.equal(agentsResponse.status(), 200);
  const agent = (await agentsResponse.json()).find(item => item.key === 'fixture-external-init'); assert.ok(agent);
  const history = await context.request.get(`${origin}/api/agent-lab/runs?agentId=${agent.id}`, { headers }); assert.equal(history.status(), 200);
  const runs = await history.json(); assert.equal(runs.length, 1); const run = runs[0]; assert.equal(run.status, 'FAILED');
  const detail = await context.request.get(`${origin}/api/agent-lab/runs/${run.id}`, { headers }); assert.equal(detail.status(), 200);
  const persisted = await detail.json(); assert.ok(persisted.completedAt); assert.equal(persisted.error, 'Application 初始化失败：必需消息持久化未确认');
  const select = page.locator('.builder-workspace > label select');
  await select.locator(`option[value="${agent.id}"]`).waitFor({ state: 'attached' }); await select.selectOption(agent.id);
  await page.getByRole('button', { name: `${run.id} · FAILED`, exact: true }).click();
  await page.getByRole('heading', { name: `运行 ${run.id}`, exact: true }).waitFor();
  await page.getByText('状态：FAILED · fixture-external-init', { exact: true }).waitFor();
  await page.getByRole('alert').filter({ hasText: persisted.error }).waitFor();
  assert.equal(await page.getByRole('button', { name: '取消运行', exact: true }).isEnabled(), false);
  await page.getByText('估算费用：未知 · 调用次数：未知', { exact: true }).waitFor();
  assert.deepEqual(await questionInputSnapshot(), before);
  await select.selectOption('');
  console.log('PASS external initialization browser: real persisted FAILED history/status/error, cancellation disabled, unknown cost retained, no provider/ledger increments');
}
