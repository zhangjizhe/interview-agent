import { verifyFreshConfirmationExit } from './interview-fresh-exit-evidence.mjs';
import { verifyUnknownQuestion } from './interview-unknown-evidence.mjs';
import { verifyTrainingReads } from './training-read-evidence.mjs';
import { verifyResumeUpload } from './resume-upload-evidence.mjs';
import { verifyTrainingTimeouts } from './training-timeout-evidence.mjs';
import { verifyTrainingActions } from './training-actions-evidence.mjs';
import { verifyEndTimeout } from './interview-end-timeout-evidence.mjs';
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
  const confirmation = page.waitForResponse(r => r.url() === `${origin}/api/interview/${data.interviewId}/confirm-resume` && r.request().method() === 'POST'); confirmation.catch(() => undefined);
  await page.getByRole('button', { name: '核验题目状态', exact: true }).click();
  const confirmedResponse = await confirmation; assert.equal(confirmedResponse.status(), 201);
  const confirmed = await confirmedResponse.json(); assert.equal(confirmed.success, true); assert.equal(confirmed.questionProtocol, 'presentation/v1');
  const presented = confirmed.currentQuestion; assert.ok(presented && presented.state === 'OPEN');
  for (const key of ['presentationId', 'taskId', 'messageId', 'question']) assert.ok(typeof presented[key] === 'string' && presented[key].trim());
  const token = await page.evaluate(() => localStorage.getItem('ia_access_token')); assert.ok(token);
  const currentResponse = await page.request.get(`${origin}/api/interview/${data.interviewId}`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(currentResponse.status(), 200); const current = await currentResponse.json();
  assert.equal(current.questionProtocol, 'presentation/v1'); assert.deepEqual(current.currentQuestion, presented);
  assert.ok(current.messages.some(message => message.id === presented.messageId && message.role === 'assistant' && message.content === presented.question));
  await page.getByRole('region', { name: '当前题目', exact: true }).getByText(presented.question, { exact: true }).waitFor();
  await page.getByPlaceholder('输入当前题目的回答...', { exact: true }).waitFor();
  // The field changes its placeholder while PROCESSING. Keep its identity while
  // asserting disabled state across that transition.
  const composer = page.locator('textarea');
  for (let attempt = 0; attempt < 2; attempt++) {
    await composer.fill(`Synthetic browser policy attempt ${attempt}`);
    const reply = page.waitForResponse(r => r.url().endsWith(`/interview/${data.interviewId}/message`) && r.request().method() === 'POST'); reply.catch(() => undefined);
    await composer.press('Control+Enter');
    const response = await reply; assert.equal(response.status(), 200);
    const submitted = response.request().postDataJSON();
    assert.equal(submitted.operation, 'ANSWER'); assert.equal(submitted.presentationId, presented.presentationId); assert.equal(submitted.content, `Synthetic browser policy attempt ${attempt}`);
    const text = await response.text(); assert.match(text, /"type":"error"/); assert.ok(!text.includes('[DONE]') && !text.includes('"type":"token"'));
    await page.getByRole('alert').filter({ hasText: '当前回答暂时无法处理，请稍后重试。' }).waitFor();
    await composer.waitFor(); await composer.fill('Ready for explicit retry'); assert.equal(await composer.isEnabled(), true);
    assert.ok(!(await page.locator('body').innerText()).includes('synthetic-private-policy'));
  }
  await verifyResumeUpload(page, control);
  await verifyStreamSessionBoundary(page, data, composer);
  await verifyHistorySessionBoundary(page, data, composer);
  await verifyHistorySessionBoundary(page, data, composer, true);
  await verifyConfirmationHistory(page, data, control);
  await verifyFreshConfirmationExit(page, data, control);
  await verifyEndReceipt(page, data, control);
  await verifyEndTimeout(page, data, control);
  await verifyEndLifecycle(page, data, control);
  await verifyUnknownQuestion(page, data, control);
  await verifyTrainingActions(page, control);
  await verifyTrainingTimeouts(page, control);
  await verifyTrainingReads(page, control);
  assert.deepEqual(errors, []);
  console.log('PASS candidate policy browser: real SSE refusal, visible generic error, composer restored and explicit retry, no model/ledger/message persistence');
} catch (error) { firstError = error; throw error; }
finally {
  const cleanupErrors = [];
  try { await browser?.close(); } catch (error) { cleanupErrors.push(error); }
  if (prepared) { try { control('verify-restore'); } catch (error) { cleanupErrors.push(error); } }
  if (cleanupErrors.length) throw new AggregateError([...(firstError ? [firstError] : []), ...cleanupErrors], 'Policy browser fixture restore/check failed');
}
