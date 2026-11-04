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

export async function completeEmailLogin(page, { userId, password, loginButton = '继续并发送验证码', claimSendButton = '发送验证邮件' }) {
  await page.getByLabel('用户名', { exact: true }).fill(userId);
  await page.getByLabel('密码', { exact: true }).fill(password);
  const loginResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/login' && response.request().method() === 'POST');
  await page.getByRole('button', { name: loginButton, exact: true }).click();
  const response = await loginResponse;
  assert.equal(response.status(), 200);
  const started = await response.json();
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
    const verifyClaim = page.waitForResponse(item => new URL(item.url()).pathname === '/api/auth/login/claim-email/verify' && item.request().method() === 'POST');
    await page.getByRole('button', { name: '验证并登录', exact: true }).click();
    const verifiedClaim = await verifyClaim;
    assert.equal(verifiedClaim.status(), 200);
    return verifiedClaim.json();
  }
  assert.equal(started.requiresEmailVerification, true);
  const code = await readEmailCode(started.challengeId);
  await page.getByLabel('邮箱验证码', { exact: true }).fill(code);
  const verified = page.waitForResponse(item => new URL(item.url()).pathname === '/api/auth/login/verify-email' && item.request().method() === 'POST');
  await page.getByRole('button', { name: '验证并登录', exact: true }).click();
  const verifiedResponse = await verified;
  assert.equal(verifiedResponse.status(), 200);
  return verifiedResponse.json();
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
  assert.equal(started.requiresEmailVerification, true);
  const response = await fetch(`${apiBase}/auth/login/verify-email`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challengeId: started.challengeId, code: await readEmailCode(started.challengeId) }) });
  assert.equal(response.status, 200);
  return response.json();
}
