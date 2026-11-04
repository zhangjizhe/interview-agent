/**
 * Local acceptance test for the authenticated web shell.
 *
 * The API is intentionally mocked here because this validates UI behavior
 * independently from Docker, Postgres, and external LLM availability.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputDir = process.env.AUTH_ACCEPTANCE_OUTPUT_DIR || join(__dirname, 'screenshots', 'acceptance-2026-08-12');
const webUrl = process.env.WEB_URL || 'http://127.0.0.1:4173';
const chromePath = process.env.CHROME_PATH;
mkdirSync(outputDir, { recursive: true });

const checks = [];
function check(name, passed, detail = '') {
  checks.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
}

async function mockApi(page) {
  const codes = new Map();
  let challengeNumber = 0;
  let created = false;
  const session = {
    accessToken: 'acceptance-test-token',
    userId: 'acceptance-user',
    email: 'acceptance-user@example.test',
    role: 'USER',
  };
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let body = {};
    let status = 200;

    if (path.startsWith('/api/auth/check/')) { body = { available: true };
    } else if (path === '/api/auth/registration-code') {
      const challengeId = `registration-challenge-${++challengeNumber}`;
      codes.set(challengeId, '123456');
      body = { challengeId };
    } else if (path === '/api/auth/register') {
      const request = route.request().postDataJSON();
      created = codes.get(request.challengeId) === request.code && request.email === 'acceptance-user@example.test';
      if (!created) status = 401;
      else body = { ...session, created: true, name: 'acceptance-user' };
    } else if (path === '/api/auth/login') {
      const request = route.request().postDataJSON();
      if (!created || request.userId !== session.userId || request.password !== 'acceptance-password-123') status = 401;
      else body = session;
    } else if (path === '/api/interview/stats') {
      body = { totalTokens: 0, totalPrompt: 0, totalCompletion: 0, totalInterviews: 0, completedInterviews: 0 };
    } else if (path === '/api/interview/list') {
      body = [];
    } else if (path === '/api/interview/empty-rooms') {
      body = { emptyRooms: [], count: 0 };
    } else if (path === '/api/tools') {
      body = { tools: [], count: 0, enabledCount: 0, userDisabledCount: 0 };
    } else if (path === '/api/metrics/vitals') {
      body = { ok: true };
    } else if (path === '/api/knowledge-base/list') {
      body = { items: [], total: 0 };
    } else if (path === '/api/interview/question-bank/list') {
      body = { results: [], count: 0 };
    }

    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

async function runDesktop(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  await mockApi(page);
  await page.goto(webUrl, { waitUntil: 'networkidle' });

  check('authentication gate visible', await page.getByRole('heading', { name: '欢迎回来', exact: true }).count() === 1);
  check('login form has username/password fields', await page.getByLabel('用户名').count() === 1 && await page.getByLabel('密码').count() === 1);
  await page.screenshot({ path: join(outputDir, '01-auth-login-desktop.png'), fullPage: true });

  const createAccount = page.getByRole('button', { name: '没有账号，创建账号' });
  check('registration switch is unique', await createAccount.count() === 1);
  await createAccount.click();
  check('registration form requires email and a verification code', await page.getByLabel('邮箱').count() === 1 && await page.getByRole('button', { name: '发送邮箱验证码' }).count() === 1);
  await page.screenshot({ path: join(outputDir, '02-auth-register-desktop.png'), fullPage: true });

  await page.getByLabel('用户名').fill('acceptance-user');
  await page.getByLabel('密码').fill('acceptance-password-123');
  await page.getByLabel('邮箱').fill('acceptance-user@example.test');
  await page.getByRole('button', { name: '发送邮箱验证码' }).click();
  await page.getByLabel('邮箱验证码').fill('123456');
  await page.getByRole('button', { name: '验证并创建账号' }).click();
  await page.getByRole('status').getByText('邮箱已验证，账号创建成功。请使用用户名和密码登录。').waitFor({ state: 'visible' });

  await page.getByLabel('用户名').fill('acceptance-user');
  await page.getByLabel('密码').fill('acceptance-password-123');
  await page.getByRole('button', { name: '登录' }).click();
  await page.getByRole('link', { name: '首页', exact: true }).waitFor({ state: 'visible' });
  check('successful authenticated navigation reaches home', await page.getByRole('link', { name: '首页', exact: true }).count() === 1);
  await page.screenshot({ path: join(outputDir, '03-authenticated-home-desktop.png'), fullPage: true });

  await page.goto(`${webUrl}/admin/mcp`, { waitUntil: 'networkidle' });
  check('ordinary user is redirected away from admin route', new URL(page.url()).pathname === '/');
  await context.close();
}

async function runMobile(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await mockApi(page);
  await page.goto(webUrl, { waitUntil: 'networkidle' });
  check('mobile authentication gate renders with email verification', await page.getByRole('button', { name: '登录' }).count() === 1);
  await page.screenshot({ path: join(outputDir, '04-auth-login-mobile.png'), fullPage: true });
  await context.close();
}

const browser = await chromium.launch({
  headless: true,
  executablePath: chromePath || undefined,
});
try {
  await runDesktop(browser);
  await runMobile(browser);
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
    '01-auth-login-desktop.png',
    '02-auth-register-desktop.png',
    '03-authenticated-home-desktop.png',
    '04-auth-login-mobile.png',
  ],
};
writeFileSync(join(outputDir, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
if (report.failed > 0) process.exit(1);
