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
  await userPage.getByLabel('岗位名称').fill('B0 Browser Acceptance Engineer');
  await userPage.getByLabel('职级').fill('P5');
  await userPage.getByRole('button', { name: '保存岗位' }).click();
  await userPage.getByRole('status').getByText('岗位已创建并设为当前岗位').waitFor({ state: 'visible' });
  check('ordinary user can create an owned target job', await userPage.getByText('B0 Browser Acceptance Engineer', { exact: true }).count() === 1);

  await userPage.goto(`${webUrl}/admin/mcp`, { waitUntil: 'networkidle' });
  check('ordinary user is redirected from admin route', new URL(userPage.url()).pathname === '/');
  await userContext.close();

  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const adminPage = await adminContext.newPage();
  await adminPage.goto(webUrl, { waitUntil: 'networkidle' });
  await loginExisting(adminPage, 'admin-acceptance', 'ADMIN');
  await adminPage.goto(`${webUrl}/admin/mcp`, { waitUntil: 'networkidle' });
  const heading = adminPage.getByRole('heading', { name: 'MCP 服务管理' });
  check('administrator can access MCP management page', await heading.count() === 1);
  await adminPage.screenshot({ path: join(outputDir, '07-real-admin-mcp.png'), fullPage: true });

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto(webUrl, { waitUntil: 'networkidle' });
  check('mobile login gate renders against real API', await mobilePage.getByRole('button', { name: '登录' }).count() === 1);
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
    '07-real-admin-mcp.png',
    '08-real-login-mobile.png',
  ],
};
writeFileSync(join(outputDir, 'real-results.json'), `${JSON.stringify(report, null, 2)}\n`);
if (report.failed > 0) process.exit(1);
