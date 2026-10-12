import assert from 'node:assert/strict';
import { questionInputSnapshot } from './lab-question-input-snapshot.mjs';

/** Real Redis session revocation; no browser response injection. */
export async function verifySessionRevocation(page, context, origin) {
  assert.equal(process.env.LAB_FIXTURE_SYNTHETIC, '1');
  assert.equal(origin, 'http://localhost:5176');
  const token = await page.evaluate(() => localStorage.getItem('ia_access_token'));
  assert.ok(token);
  const headers = { Authorization: `Bearer ${token}` };
  const before = await questionInputSnapshot();
  await page.getByRole('button', { name: '题库治理', exact: true }).click();
  await page.getByLabel('岗位', { exact: true }).waitFor();
  const revoked = await context.request.post(`${origin}/api/auth/logout`, { headers });
  assert.equal(revoked.status(), 200);
  const denied = page.waitForResponse(response => new URL(response.url()).pathname === '/api/interview/question-bank/list' && new URL(response.url()).searchParams.get('position') === 'Synthetic revoked session' && response.request().method() === 'GET' && response.status() === 401);
  void denied.catch(() => {});
  await page.getByLabel('岗位', { exact: true }).fill('Synthetic revoked session');
  await denied;
  await page.getByText('登录已过期，请重新登录。', { exact: true }).waitFor();
  await page.getByRole('button', { name: '登录控制台', exact: true }).waitFor();
  assert.deepEqual(await page.evaluate(() => ['ia_access_token', 'ia_user_role', 'ia_userId'].map(key => localStorage.getItem(key))), [null, null, null]);
  assert.equal(await page.getByRole('navigation', { name: 'Agent Lab 导航', exact: true }).count(), 0);
  assert.equal(await page.locator('article.question-bank-row').count(), 0);
  assert.equal((await context.request.get(`${origin}/api/auth/profile`, { headers })).status(), 401);
  assert.equal((await context.request.post(`${origin}/api/admin/mcp-servers/reload`, { headers })).status(), 401);
  assert.deepEqual(await questionInputSnapshot(), before);
  await page.reload();
  await page.getByRole('button', { name: '登录控制台', exact: true }).waitFor();
  await page.getByLabel('用户名', { exact: true }).fill('fixture-ci-admin');
  await page.getByLabel('密码', { exact: true }).fill('isolated-fixture-password');
  const loggedIn = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/login' && response.request().method() === 'POST');
  void loggedIn.catch(() => {});
  await page.getByRole('button', { name: '登录控制台', exact: true }).click();
  assert.equal((await loggedIn).status(), 200);
  await page.getByRole('heading', { name: '控制中心', exact: true, level: 1 }).waitFor();
  const newToken = await page.evaluate(() => localStorage.getItem('ia_access_token'));
  assert.ok(newToken);
  assert.equal((await context.request.get(`${origin}/api/auth/profile`, { headers: { Authorization: `Bearer ${newToken}` } })).status(), 200);
  assert.equal((await context.request.get(`${origin}/api/auth/profile`, { headers })).status(), 401);
  assert.deepEqual(await questionInputSnapshot(), before);
  console.log('PASS real session revocation: old token query/profile/admin401, cleared session and UI, real new login200, zero provider/ledger increment');
}
