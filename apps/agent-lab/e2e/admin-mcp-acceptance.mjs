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
  console.log('checking login gate');
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  if (await page.getByRole('heading', { name: 'Agent Lab 管理员登录' }).count() !== 1) throw new Error('admin login gate missing');

  await page.getByLabel('用户名').fill('admin-acceptance');
  await page.getByLabel('密码').fill(password);
  await page.getByRole('button', { name: '登录控制台' }).click();
  console.log('checking admin control plane');
  await page.getByRole('heading', { name: 'Agent 控制台' }).waitFor({ state: 'visible' });
  if (await page.getByRole('button', { name: '重载配置' }).count() !== 1) throw new Error('MCP control action missing');

  const userContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const userPage = await userContext.newPage();
  console.log('checking ordinary-user rejection');
  await userPage.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  const ordinaryUserId = `agent-lab-user-${Date.now()}`;
  await userPage.getByRole('button', { name: '创建管理员账号' }).click();
  await userPage.getByLabel('用户名').fill(ordinaryUserId);
  await userPage.getByLabel('密码').fill(password);
  await userPage.getByRole('button', { name: '创建并验证权限' }).click();
  await userPage.getByText('当前账号不在 Agent Lab 管理员允许名单中').waitFor({ state: 'visible' });
  await userContext.close();
  console.log('PASS Agent Lab admin login, MCP control access, and USER rejection');
} finally {
  await browser.close();
}
