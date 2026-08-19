import { createRequire } from 'node:module';
const require = createRequire(new URL('../../web/package.json', import.meta.url));
const { chromium } = require('playwright');

const baseUrl = process.env.AGENT_LAB_URL || 'http://localhost:5175';
const chromePath = process.env.CHROME_PATH;
const password = 'acceptance-password-123';

const browser = await chromium.launch({ headless: true, executablePath: chromePath || undefined });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  if (await page.getByRole('heading', { name: 'Agent Lab 管理员登录' }).count() !== 1) throw new Error('admin login gate missing');

  await page.getByLabel('用户名').fill('admin-acceptance');
  await page.getByLabel('密码').fill(password);
  await page.getByRole('button', { name: '登录控制台' }).click();
  await page.getByRole('heading', { name: 'MCP 服务治理' }).waitFor({ state: 'visible' });
  if (await page.getByRole('button', { name: '重载配置' }).count() !== 1) throw new Error('MCP control action missing');

  const ordinaryUserId = `agent-lab-user-${Date.now()}`;
  const registration = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: ordinaryUserId, password }),
  });
  if (!registration.ok) throw new Error('ordinary user registration failed');

  const userContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const userPage = await userContext.newPage();
  await userPage.goto(baseUrl, { waitUntil: 'networkidle' });
  await userPage.getByLabel('用户名').fill(ordinaryUserId);
  await userPage.getByLabel('密码').fill(password);
  await userPage.getByRole('button', { name: '登录控制台' }).click();
  await userPage.getByText('当前账号没有 Agent Lab 管理权限').waitFor({ state: 'visible' });
  await userContext.close();
  console.log('PASS Agent Lab admin login, MCP control access, and USER rejection');
} finally {
  await browser.close();
}
