import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

export function readFixtureEmailCode(challengeId) {
  assert.equal(process.env.LAB_FIXTURE_SYNTHETIC, '1', 'Synthetic SMTP inbox is only available in the isolated fixture.');
  const container = process.env.LAB_FIXTURE_API_CONTAINER;
  assert.match(container || '', /^interview-built-check-\d+-api$/);
  assert.match(challengeId || '', /^[0-9a-f-]{36}$/i);
  const code = execFileSync('docker', ['exec', container, 'node', '/tmp/read-fixture-auth-code.mjs', challengeId], { encoding: 'utf8', timeout: 10000 });
  assert.match(code, /^\d{6}$/);
  return code;
}

export async function readEmailCode(challengeId) {
  if (process.env.LAB_FIXTURE_SYNTHETIC === '1') return readFixtureEmailCode(challengeId);
  if (!stdin.isTTY || !stdout.isTTY) throw new Error('Real SMTP acceptance needs an interactive terminal to enter the mailbox code.');
  const terminal = createInterface({ input: stdin, output: stdout });
  try {
    const code = await terminal.question(`Enter the 6-digit email code for challenge ${challengeId}: `);
    assert.match(code, /^\d{6}$/);
    return code;
  } finally { terminal.close(); }
}

async function submitLoginCode(page, path, buttonName = '验证并登录') {
  // Lab reloads immediately on success. Buffer the real server response before
  // forwarding it unchanged so Chromium navigation cannot discard its body.
  const url = new URL(path, page.url()).href;
  let resolveReply, rejectReply;
  const reply = new Promise((resolve, reject) => { resolveReply = resolve; rejectReply = reject; });
  void reply.catch(() => {});
  const capture = async route => {
    try {
      const response = await route.fetch({ maxRedirects: 0 });
      const data = await response.json();
      const status = response.status();
      await route.fulfill({ response });
      resolveReply({ status, data });
    } catch (error) {
      rejectReply(error);
      await route.abort().catch(() => {});
    }
  };
  await page.route(url, capture);
  try {
    await page.getByRole('button', { name: buttonName, exact: true }).click();
    const result = await reply;
    assert.equal(result.status, 200);
    return result.data;
  } finally { await page.unroute(url, capture); }
}

export async function completeEmailLogin(page, { userId, password, loginButton = '登录', claimSendButton = '发送验证邮件' }) {
  await page.getByLabel('用户名', { exact: true }).fill(userId);
  await page.getByLabel('密码', { exact: true }).fill(password);
  const started = await submitLoginCode(page, '/api/auth/login', loginButton);
  if (started.accessToken) { assert.ok(started.refreshToken); assert.equal(started.requiresEmailVerification, undefined); return started; }
  if (started.requiresEmailClaim) {
    if (process.env.LAB_FIXTURE_SYNTHETIC === '1') throw new Error('Synthetic login unexpectedly reached the legacy email claim flow.');
    const email = process.env.AUTH_ACCEPTANCE_LEGACY_EMAIL;
    if (!email) throw new Error('This legacy account needs AUTH_ACCEPTANCE_LEGACY_EMAIL to claim a mailbox after proving its current password.');
    await page.getByLabel('邮箱', { exact: true }).fill(email);
    const claimResponse = page.waitForResponse(item => new URL(item.url()).pathname === '/api/auth/login/claim-email' && item.request().method() === 'POST');
    await page.getByRole('button', { name: claimSendButton, exact: true }).click();
    const claim = await claimResponse;
    assert.equal(claim.status(), 200);
    const claimStart = await claim.json();
    await page.getByLabel('邮箱验证码', { exact: true }).fill(await readEmailCode(claimStart.challengeId));
    return submitLoginCode(page, '/api/auth/login/claim-email/verify');
  }
  assert.equal(started.requiresEmailVerification, true);
  const code = await readEmailCode(started.challengeId);
  await page.getByLabel('邮箱验证码', { exact: true }).fill(code);
  return submitLoginCode(page, '/api/auth/login/verify-email');
}

export async function registerThroughEmailUI(page, { userId, password, email, registerEntryButton = '没有账号，创建账号' }) {
  await page.getByRole('button', { name: registerEntryButton, exact: true }).click();
  await page.getByLabel('用户名', { exact: true }).fill(userId);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByLabel('邮箱', { exact: true }).fill(email);
  const codeRequest = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/registration-code' && response.request().method() === 'POST');
  await page.getByRole('button', { name: '发送邮箱验证码', exact: true }).click();
  const codeResponse = await codeRequest;
  assert.equal(codeResponse.status(), 200);
  const { challengeId } = await codeResponse.json();
  await page.getByLabel('邮箱验证码', { exact: true }).fill(await readEmailCode(challengeId));
  const registration = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/register' && response.request().method() === 'POST');
  await page.getByRole('button', { name: '验证并创建账号', exact: true }).click();
  const registered = await registration;
  assert.equal(registered.status(), 200);
  return registered.json();
}

export async function registerThroughEmailApi(apiBase, { userId, password, email }) {
  const codeResponse = await fetch(`${apiBase}/auth/registration-code`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
  assert.equal(codeResponse.status, 200);
  const { challengeId } = await codeResponse.json();
  const response = await fetch(`${apiBase}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, password, email, challengeId, code: await readEmailCode(challengeId) }) });
  assert.equal(response.status, 200);
  return response.json();
}

export async function loginThroughEmailApi(apiBase, { userId, password }) {
  const startResponse = await fetch(`${apiBase}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, password }) });
  assert.equal(startResponse.status, 200);
  const started = await startResponse.json();
  if (started.requiresEmailClaim) {
    const email = process.env.AUTH_ACCEPTANCE_LEGACY_EMAIL;
    if (!email) throw new Error('This legacy account needs AUTH_ACCEPTANCE_LEGACY_EMAIL to claim a mailbox after proving its current password.');
    const claimResponse = await fetch(`${apiBase}/auth/login/claim-email`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, password, email }) });
    assert.equal(claimResponse.status, 200);
    const claim = await claimResponse.json();
    const verifyClaim = await fetch(`${apiBase}/auth/login/claim-email/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, email, challengeId: claim.challengeId, code: await readEmailCode(claim.challengeId) }) });
    assert.equal(verifyClaim.status, 200);
    return verifyClaim.json();
  }
  assert.ok(started.accessToken); assert.ok(started.refreshToken);
  assert.equal(started.requiresEmailVerification, undefined);
  return started;
}
