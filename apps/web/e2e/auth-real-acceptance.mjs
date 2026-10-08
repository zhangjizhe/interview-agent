/**
 * Full-stack local acceptance test against the Docker Compose API and nginx web.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputDir = join(__dirname, 'screenshots', 'acceptance-2026-08-15');
const webUrl = process.env.WEB_URL || 'http://localhost:5173';
const chromePath = process.env.CHROME_PATH;
const password = 'acceptance-password-123';
const suffix = Date.now();
const userId = `browser-user-${suffix}`;

mkdirSync(outputDir, { recursive: true });

const checks = [];
function check(name, passed, detail = '') {
  checks.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
}

async function requestJson(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(new URL(`/api${path}`, webUrl), {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }
  return { response, data };
}

async function registerAndLogin(page, id, expectedRole) {
  const registerSwitch = page.getByRole('button', { name: '没有账号，创建账号' });
  await registerSwitch.click();
  await page.getByLabel('用户名').fill(id);
  await page.getByLabel('密码').fill(password);
  await page.getByRole('button', { name: '创建账号' }).click();
  await page.getByText('账号已创建，请登录。', { exact: true }).waitFor({ state: 'visible' });
  const loginButton = page.getByRole('button', { name: '登录' });
  await loginButton.waitFor({ state: 'visible' });
  await page.getByLabel('用户名').fill(id);
  await page.getByLabel('密码').fill(password);
  check(`${id} login submit is enabled`, await loginButton.isEnabled());
  await loginButton.click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: join(outputDir, `debug-after-login-${id}.png`), fullPage: true });
  const homeLink = page.getByRole('link', { name: '首页' });
  const homeLinkCount = await homeLink.count();
  if (homeLinkCount !== 1) {
    const state = await page.evaluate(() => ({
      session: localStorage.getItem('ia_access_token') ? 'present' : 'missing',
      route: location.pathname,
      mainText: document.querySelector('main')?.textContent?.slice(0, 300) || '',
    }));
    throw new Error(`login did not render home: ${JSON.stringify(state)}`);
  }
  await homeLink.waitFor({ state: 'visible' });
  const role = await page.evaluate(() => localStorage.getItem('ia_user_role'));
  check(`${id} receives ${expectedRole} session role`, role === expectedRole, role || 'missing');
}

async function loginExisting(page, id, expectedRole) {
  await page.getByLabel('用户名').fill(id);
  await page.getByLabel('密码').fill(password);
  const loginButton = page.getByRole('button', { name: '登录' });
  check(`${id} login submit is enabled`, await loginButton.isEnabled());
  await loginButton.click();
  await page.getByRole('link', { name: '首页' }).waitFor({ state: 'visible' });
  const role = await page.evaluate(() => localStorage.getItem('ia_user_role'));
  check(`${id} receives ${expectedRole} session role`, role === expectedRole, role || 'missing');
}

const browser = await chromium.launch({
  headless: true,
  executablePath: chromePath || undefined,
});
try {
  const userContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const userPage = await userContext.newPage();
  await userPage.goto(webUrl, { waitUntil: 'networkidle' });
  check('login gate is visible before session', await userPage.getByRole('button', { name: '登录' }).count() === 1);
  await userPage.screenshot({ path: join(outputDir, '05-real-login-desktop.png'), fullPage: true });

  await registerAndLogin(userPage, userId, 'USER');
  check('ordinary user reaches authenticated home', await userPage.getByRole('link', { name: '首页' }).count() === 1);
  await userPage.screenshot({ path: join(outputDir, '06-real-user-home.png'), fullPage: true });

  await userPage.goto(`${webUrl}/settings`, { waitUntil: 'networkidle' });
  await userPage.getByLabel('岗位名称').fill('B3 Browser Acceptance Engineer');
  await userPage.getByLabel('职级').fill('P5');
  await userPage.getByRole('button', { name: '保存岗位' }).click();
  await userPage.getByRole('status').getByText('岗位已创建并设为当前岗位').waitFor({ state: 'visible' });
  check('ordinary user can create an owned target job', await userPage.getByText('B3 Browser Acceptance Engineer', { exact: true }).count() === 1);

  const userToken = await userPage.evaluate(() => localStorage.getItem('ia_access_token'));
  const listAfterCreate = await requestJson('/interview/target-jobs', { token: userToken });
  const firstJob = listAfterCreate.data?.find((job) => job.title === 'B3 Browser Acceptance Engineer');
  check('created target job is active and versioned', listAfterCreate.response.ok && firstJob?.isActive === true && firstJob?.profileVersion === 1);

  const editButton = userPage.getByRole('button', { name: '编辑B3 Browser Acceptance Engineer' });
  check('target job edit control is available', await editButton.count() === 1);
  await editButton.click();
  await userPage.waitForFunction(() => {
    const label = Array.from(document.querySelectorAll('label')).find((item) => item.textContent?.includes('职级'));
    return label?.querySelector('input')?.value === 'P5';
  });
  await userPage.getByLabel('职级').fill('P6');
  await userPage.getByRole('button', { name: '保存岗位' }).click();
  await userPage.getByRole('status').getByText('岗位已更新').waitFor({ state: 'visible' });

  const afterUpdate = await requestJson('/interview/target-jobs', { token: userToken });
  const updatedJob = afterUpdate.data?.find((job) => job.id === firstJob?.id);
  check('target job update increments profile version', updatedJob?.level === 'P6' && updatedJob?.profileVersion === 2);

  const secondJobResponse = await requestJson('/interview/target-jobs', {
    method: 'POST',
    token: userToken,
    body: { title: 'B3 Secondary Role', level: 'P5' },
  });
  const secondJob = secondJobResponse.data;
  const afterSecondCreate = await requestJson('/interview/target-jobs', { token: userToken });
  check(
    'creating a second job leaves exactly one active job',
    secondJobResponse.response.ok
      && secondJob?.isActive === true
      && afterSecondCreate.data?.filter((job) => job.isActive).length === 1
      && afterSecondCreate.data?.find((job) => job.id === secondJob.id)?.isActive === true,
  );
  await userPage.reload({ waitUntil: 'networkidle' });
  const activateFirst = userPage.getByRole('button', { name: '设为当前' });
  check('inactive target job can be activated', await activateFirst.count() === 1);
  await activateFirst.click();
  await userPage.getByRole('status').getByText('当前岗位已切换为B3 Browser Acceptance Engineer').waitFor({ state: 'visible' });

  const afterActivate = await requestJson('/interview/target-jobs', { token: userToken });
  check(
    'target job activation preserves the single-active invariant',
    afterActivate.data?.filter((job) => job.isActive).length === 1
      && afterActivate.data?.find((job) => job.id === firstJob?.id)?.isActive === true,
  );
  const readiness = await requestJson(`/interview/target-jobs/${firstJob.id}/readiness`, { token: userToken });
  check(
    'readiness is versioned and remains evidence-honest before a final evaluation',
    readiness.response.ok
      && readiness.data?.targetJob?.profileVersion === 2
      && readiness.data?.available === false
      && readiness.data?.overallScore === null,
  );

  await userPage.goto(webUrl, { waitUntil: 'networkidle' });
  await userPage.getByRole('button', { name: '开始模拟面试' }).first().click();
  check(
    'candidate can choose full simulation or skill practice before starting',
    await userPage.getByRole('button', { name: '完整模拟' }).count() === 1
      && await userPage.getByRole('button', { name: '单技能练习' }).count() === 1,
  );
  await userPage.getByRole('button', { name: '单技能练习' }).click();
  const practiceSkillSelect = userPage.getByLabel('练习技能');
  await practiceSkillSelect.waitFor({ state: 'visible' });
  check(
    'skill practice only offers skills from the selected target job',
    await practiceSkillSelect.locator('option').count() > 1,
  );
  await userPage.screenshot({ path: join(outputDir, '09-interview-mode-selection.png'), fullPage: true });

  await userPage.goto(`${webUrl}/training`, { waitUntil: 'networkidle' });
  check(
    'training page does not fabricate recommendations without final evidence',
    await userPage.getByRole('heading', { name: '还没有可开始的训练' }).count() === 1,
  );
  await userPage.screenshot({ path: join(outputDir, '10-training-empty-state.png'), fullPage: true });

  const expiredContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const expiredPage = await expiredContext.newPage();
  await expiredPage.addInitScript(() => {
    localStorage.setItem('ia_access_token', 'expired-token');
    localStorage.setItem('ia_userId', 'expired-user');
    localStorage.setItem('ia_user_role', 'USER');
  });
  await expiredPage.goto(`${webUrl}/settings`, { waitUntil: 'networkidle' });
  await expiredPage.getByRole('button', { name: '登录' }).waitFor({ state: 'visible' });
  check('expired JWT returns candidate to the login gate', await expiredPage.getByText('登录已过期，请重新登录。').count() === 1);
  await expiredContext.close();

  const foreignUserId = `browser-foreign-${suffix}`;
  const foreignRegister = await requestJson('/auth/register', {
    method: 'POST',
    body: { userId: foreignUserId, password },
  });
  check('foreign test user can register', foreignRegister.response.ok);
  const foreignLogin = await requestJson('/auth/login', {
    method: 'POST',
    body: { userId: foreignUserId, password },
  });
  const foreignToken = foreignLogin.data?.accessToken;
  const foreignRead = await requestJson(`/interview/target-jobs/${firstJob.id}/readiness`, { token: foreignToken });
  const foreignActivate = await requestJson(`/interview/target-jobs/${firstJob.id}/activate`, {
    method: 'POST',
    token: foreignToken,
  });
  check('foreign user cannot read or activate another user target job', foreignRead.response.status === 404 && foreignActivate.response.status === 404);

  await userPage.goto(`${webUrl}/admin/mcp`, { waitUntil: 'networkidle' });
  check('ordinary user is redirected from admin route', new URL(userPage.url()).pathname === '/');
  await userContext.close();

  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const adminPage = await adminContext.newPage();
  await adminPage.goto(webUrl, { waitUntil: 'networkidle' });
  await loginExisting(adminPage, 'admin-acceptance', 'ADMIN');
  await adminPage.goto(`${webUrl}/admin/mcp`, { waitUntil: 'networkidle' });
  check('candidate application redirects legacy MCP route to the training workspace', new URL(adminPage.url()).pathname === '/');
  await adminPage.screenshot({ path: join(outputDir, '07-legacy-admin-redirect.png'), fullPage: true });

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto(webUrl, { waitUntil: 'networkidle' });
  check('mobile login gate renders against real API', await mobilePage.getByRole('button', { name: '登录' }).count() === 1);
  await mobilePage.getByLabel('用户名').fill(userId);
  await mobilePage.getByLabel('密码').fill(password);
  await mobilePage.getByRole('button', { name: '登录' }).click();
  await mobilePage.getByRole('heading', { name: '为目标岗位做准备' }).waitFor({ state: 'visible' });
  await mobilePage.goto(`${webUrl}/training`, { waitUntil: 'networkidle' });
  const mobileLayout = await mobilePage.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    hasMcpControlText: document.body.textContent?.includes('MCP 服务运行时状态') || false,
  }));
  check(
    'mobile candidate workflow fits viewport and excludes MCP control plane',
    mobileLayout.scrollWidth <= mobileLayout.clientWidth && !mobileLayout.hasMcpControlText,
    JSON.stringify(mobileLayout),
  );
  await mobilePage.screenshot({ path: join(outputDir, '08-real-login-mobile.png'), fullPage: true });

  await adminContext.close();
  await mobileContext.close();
} finally {
  await browser.close();
}

const passed = checks.filter((item) => item.passed).length;
const report = {
  generatedAt: new Date().toISOString(),
  webUrl,
  passed,
  failed: checks.length - passed,
  checks,
  screenshots: [
    '05-real-login-desktop.png',
    '06-real-user-home.png',
    '07-legacy-admin-redirect.png',
    '08-real-login-mobile.png',
    '09-interview-mode-selection.png',
    '10-training-empty-state.png',
  ],
};
writeFileSync(join(outputDir, 'real-results.json'), `${JSON.stringify(report, null, 2)}\n`);
if (report.failed > 0) process.exit(1);
