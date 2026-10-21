import { verifyEndLifecycle } from './interview-end-lifecycle-evidence.mjs';
import { verifyEndReceipt } from './interview-end-receipt-evidence.mjs';
import { verifyConfirmationHistory } from './interview-confirmation-history-evidence.mjs';
import { verifyHistorySessionBoundary } from './interview-history-session-evidence.mjs';
import { verifyStreamSessionBoundary } from './interview-stream-session-evidence.mjs';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
assert.equal(process.env.LAB_FIXTURE_SYNTHETIC, '1');
const container = process.env.LAB_FIXTURE_API_CONTAINER;
assert.match(container || '', /^interview-built-check-\d+-api$/);
const control = mode => execFileSync('docker', ['exec', container, 'node', '/tmp/fixture-policy-browser.cjs', mode], { encoding: 'utf8', timeout: 20000 });
const origin = 'http://localhost:5177';
let browser, prepared = false, firstError;
try {
  prepared = true; const data = JSON.parse(control('prepare'));
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.goto(`${origin}/interview/${data.interviewId}`);
  await page.getByLabel('用户名', { exact: true }).fill('fixture-ci-owner');
  await page.getByLabel('密码', { exact: true }).fill('isolated-fixture-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  const composer = page.getByPlaceholder('输入消息...', { exact: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    await composer.fill(`Synthetic browser policy attempt ${attempt}`);
    const reply = page.waitForResponse(r => r.url().endsWith(`/interview/${data.interviewId}/message`) && r.request().method() === 'POST'); reply.catch(() => undefined);
    await composer.press('Control+Enter');
    const response = await reply; assert.equal(response.status(), 200);
    const text = await response.text(); assert.match(text, /"type":"error"/); assert.ok(!text.includes('[DONE]') && !text.includes('"type":"token"'));
    await page.getByRole('alert').filter({ hasText: '当前回答暂时无法处理，请稍后重试。' }).waitFor();
    await composer.fill('Ready for explicit retry'); assert.equal(await composer.isEnabled(), true);
    assert.ok(!(await page.locator('body').innerText()).includes('synthetic-private-policy'));
  }
  await verifyStreamSessionBoundary(page, data, composer);
  await verifyHistorySessionBoundary(page, data, composer);
  await verifyHistorySessionBoundary(page, data, composer, true);
  await verifyConfirmationHistory(page, data, control);
  await verifyEndReceipt(page, data, control);
  await verifyEndLifecycle(page, data, control);
  assert.deepEqual(errors, []);
  console.log('PASS candidate policy browser: real SSE refusal, visible generic error, composer restored and explicit retry, no model/ledger/message persistence');
} catch (error) { firstError = error; throw error; }
finally {
  const cleanupErrors = [];
  try { await browser?.close(); } catch (error) { cleanupErrors.push(error); }
  if (prepared) { try { control('verify-restore'); } catch (error) { cleanupErrors.push(error); } }
  if (cleanupErrors.length) throw new AggregateError([...(firstError ? [firstError] : []), ...cleanupErrors], 'Policy browser fixture restore/check failed');
}
