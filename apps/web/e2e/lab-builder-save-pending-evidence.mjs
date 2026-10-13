import assert from 'node:assert/strict';
import { questionInputSnapshot } from './lab-question-input-snapshot.mjs';

export async function verifyBuilderSavePending(page, context, origin) {
  assert.equal(process.env.LAB_FIXTURE_SYNTHETIC, '1');
  assert.equal(origin, 'http://localhost:5176');
  const pattern = `${origin}/api/agent-lab/configured-agents`;
  const form = page.locator('.builder-workspace form');
  const fields = form.locator('input,textarea,select');
  const values = await Promise.all((await fields.all()).map(field => field.inputValue()));
  const before = await questionInputSnapshot();
  await page.route(pattern, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Synthetic save unavailable' }) }), { times: 1 });
  await page.getByRole('button', { name: '创建并保存初始草稿', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Synthetic save unavailable' }).waitFor();
  await page.waitForFunction(() => { const button = document.querySelector('.builder-workspace form button[type="submit"]'); return button && !button.disabled; });
  assert.deepEqual(await Promise.all((await fields.all()).map(field => field.inputValue())), values);
  assert.equal(await page.getByRole('button', { name: '新增 Agent / 工作流', exact: true }).isEnabled(), true);
  assert.deepEqual(await questionInputSnapshot(), before);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let arrived;
  const ready = new Promise(resolve => { arrived = resolve; });
  let actualSaved;
  let calls = 0;
  const held = async route => {
    calls++;
    const actual = await route.fetch({ timeout: 75000 });
    assert.equal(actual.status(), 201);
    actualSaved = await actual.json();
    assert.ok(actualSaved.id); assert.ok(actualSaved.versions[0].id);
    arrived(); await gate; await route.fulfill({ response: actual });
  };
  await page.route(pattern, held, { times: 1 });
  let timeout;
  try {
    await page.getByRole('button', { name: '创建并保存初始草稿', exact: true }).click();
    await Promise.race([ready, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Actual configured-agent save did not arrive')), 75000); })]);
    clearTimeout(timeout);
    assert.equal(await page.getByRole('button', { name: '保存中', exact: true }).isEnabled(), false);
    assert.equal(await page.getByRole('button', { name: '新增 Agent / 工作流', exact: true }).isEnabled(), false);
    assert.equal(await page.locator('.builder-workspace > label select').isEnabled(), false);
    for (const control of await form.locator('input,textarea,select,button').all()) assert.equal(await control.isEnabled(), false);
    assert.deepEqual(await Promise.all((await fields.all()).map(field => field.inputValue())), values);
    const token = await page.evaluate(() => localStorage.getItem('ia_access_token'));
    const read = await context.request.get(`${origin}/api/agent-lab/agents/${actualSaved.id}`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(read.status(), 200);
    const persisted = await read.json();
    assert.equal(persisted.name, 'browser-ci-agent'); assert.equal(persisted.key, 'browser-ci-agent');
    assert.equal(persisted.versions[0].id, actualSaved.versions[0].id);
    assert.equal(persisted.versions[0].systemPrompt, 'fixture-final');
    assert.deepEqual(await questionInputSnapshot(), before);
    await page.screenshot({ path: '/tmp/lab-builder-save-pending.png', fullPage: true });
    release();
    await page.getByText('草稿已保存。正式版本未改变；请在下方选择保存的版本核验。', { exact: true }).waitFor();
    await page.waitForFunction(id => document.querySelector('.builder-workspace select')?.value === id, actualSaved.id);
    await page.waitForFunction(id => Array.from(document.querySelectorAll('.builder-workspace select')).some(select => select.value === id && !select.disabled), actualSaved.versions[0].id);
    assert.equal(await page.locator('.builder-workspace select').nth(1).inputValue(), actualSaved.versions[0].id);
    assert.equal(await page.locator('.builder-workspace select').nth(1).isEnabled(), true);
    assert.equal(calls, 1);
    assert.deepEqual(await questionInputSnapshot(), before);
    console.log('PASS builder save pending: injected refusal retained draft, held actual201 freezes target/config, actual persisted IDs/prompt match, no model increment');
  } finally { clearTimeout(timeout); release(); await page.unroute(pattern, held); }
}
