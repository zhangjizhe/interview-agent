import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { completeEmailLogin, registerThroughEmailUI, readFixtureEmailCode } from './fixture-email-code.mjs';

assert.equal(process.env.LAB_FIXTURE_SYNTHETIC, '1', 'Only the isolated synthetic SMTP fixture is authorized.');
const origin = 'http://localhost:5176';
const userId = 'fixture-auth-admin';
const originalPassword = 'isolated-auth-original-password';
const changedPassword = 'isolated-auth-changed-password';
const resetPassword = 'isolated-auth-reset-password';
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined });
const context = await browser.newContext();
const page = await context.newPage();
const postResponse = (target, path) => target.waitForResponse(r => new URL(r.url()).pathname === `/api/auth/${path}` && r.request().method() === 'POST');
const profile = session => context.request.get(`${origin}/api/auth/profile`, { headers: { Authorization: `Bearer ${session.accessToken}` } });
async function revoked(session) {
  assert.equal((await profile(session)).status(), 401);
  assert.equal((await context.request.post(`${origin}/api/auth/refresh`, { data: { refreshToken: session.refreshToken } })).status(), 401);
}
try {
  await page.goto(origin);
  const registered = await registerThroughEmailUI(page, { userId, password: originalPassword, email: `${userId}@fixture.test`, registerEntryButton: '创建管理员账号' });
  assert.equal(registered.created, true); assert.equal(registered.role, 'ADMIN');
  assert.equal(await page.evaluate(() => localStorage.getItem('ia_access_token')), null);
  const first = await completeEmailLogin(page, { userId, password: originalPassword });
  await page.getByRole('heading', { name: '控制中心', exact: true, level: 1 }).waitFor();
  assert.equal((await profile(first)).status(), 200);

  await page.getByRole('button', { name: '修改密码', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '修改密码' });
  const sending = postResponse(page, 'change-password/request');
  await dialog.getByRole('button', { name: '发送邮箱验证码', exact: true }).click();
  const sent = await sending; assert.equal(sent.status(), 200);
  const challenge = await sent.json();
  await dialog.getByLabel('当前密码', { exact: true }).fill(originalPassword);
  await dialog.getByLabel('新密码', { exact: true }).fill(changedPassword);
  await dialog.getByLabel('邮箱验证码', { exact: true }).fill(readFixtureEmailCode(challenge.challengeId));
  const changing = postResponse(page, 'change-password');
  await dialog.getByRole('button', { name: '验证并修改密码', exact: true }).click();
  assert.equal((await changing).status(), 200);
  await page.getByRole('button', { name: '继续并发送验证码', exact: true }).waitFor();
  await revoked(first);
  const second = await completeEmailLogin(page, { userId, password: changedPassword });
  await page.getByRole('heading', { name: '控制中心', exact: true, level: 1 }).waitFor();
  assert.equal((await profile(second)).status(), 200);

  // A separate signed-out device recovers the account while device two stays
  // authenticated, so reset must actually revoke a currently active session.
  const recoveryContext = await browser.newContext();
  try {
    const recovery = await recoveryContext.newPage(); await recovery.goto(origin);
    await recovery.getByLabel('用户名', { exact: true }).fill(userId);
    await recovery.getByRole('button', { name: '忘记密码？', exact: true }).click();
    const requesting = postResponse(recovery, 'password-reset/request');
    await recovery.getByRole('button', { name: '发送找回验证码', exact: true }).click();
    const requested = await requesting; assert.equal(requested.status(), 200);
    const resetChallenge = await requested.json();
    await recovery.getByLabel('邮箱验证码', { exact: true }).fill(readFixtureEmailCode(resetChallenge.challengeId));
    await recovery.getByLabel('新密码', { exact: true }).fill(resetPassword);
    const resetting = postResponse(recovery, 'password-reset/complete');
    await recovery.getByRole('button', { name: '重置密码', exact: true }).click();
    assert.equal((await resetting).status(), 200);
    await recovery.getByRole('button', { name: '继续并发送验证码', exact: true }).waitFor();
    await revoked(second);
    const replay = await context.request.post(`${origin}/api/auth/password-reset/complete`, { data: { userId, challengeId: resetChallenge.challengeId, code: readFixtureEmailCode(resetChallenge.challengeId), newPassword: originalPassword } });
    assert.equal(replay.status(), 401);
    const third = await completeEmailLogin(recovery, { userId, password: resetPassword });
    await recovery.getByRole('heading', { name: '控制中心', exact: true, level: 1 }).waitFor();
    assert.equal((await profile(third)).status(), 200);
    assert.notEqual(third.accessToken, second.accessToken);
  } finally { await recoveryContext.close(); }
  for (const password of [originalPassword, changedPassword]) {
    assert.equal((await context.request.post(`${origin}/api/auth/login`, { data: { userId, password } })).status(), 401);
  }
  console.log('PASS auth browser + real Docker API/TLS synthetic SMTP: registration, three code-verified logins, password change, active-session reset/revocation, one-use reset and rejected old passwords; not live mailbox delivery');
} finally { await context.close(); await browser.close(); }
