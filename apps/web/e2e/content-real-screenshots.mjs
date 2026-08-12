import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const api = process.env.API_URL || 'http://localhost:3001';
const web = process.env.WEB_URL || 'http://localhost:5173';
const chromePath = process.env.CHROME_PATH;
const outputDir = join(__dirname, 'screenshots', 'acceptance-2026-08-12');
mkdirSync(outputDir, { recursive: true });

const password = 'acceptance-password-123';
const checks = [];
function check(name, passed, detail = '') {
  checks.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
  if (!passed) throw new Error(`${name} failed: ${detail}`);
}

async function request(path, options) {
  const response = await fetch(`${api}${path}`, options);
  const body = await response.json();
  if (!response.ok) throw new Error(`${path} ${response.status}: ${body.message || ''}`);
  return body;
}

async function login(page, id) {
  await page.goto(web, { waitUntil: 'networkidle' });
  await page.getByLabel('用户名').fill(id);
  await page.getByLabel('密码').fill(password);
  await page.getByRole('button', { name: '登录' }).click();
  await page.getByRole('link', { name: '题库' }).waitFor({ state: 'visible' });
}

const userId = `content-shot-${Date.now()}`;
const register = await request('/api/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId, password }),
});
const userLogin = await request('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId, password }),
});
const resumeForm = new FormData();
resumeForm.append(
  'file',
  new Blob([readFileSync(join(__dirname, '..', '..', 'api', 'tests', 'fixtures', 'acceptance-resume.md'))], { type: 'text/markdown' }),
  'acceptance-resume.md',
);
resumeForm.append('position', 'AI Agent 工程师');
const resumeResponse = await fetch(`${api}/api/interview/upload-resume`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${userLogin.accessToken}` },
  body: resumeForm,
});
if (!resumeResponse.ok) throw new Error(`resume upload ${resumeResponse.status}`);
const start = await request('/api/interview/start', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${userLogin.accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ position: 'AI Agent 工程师', level: 'P5' }),
});

const browser = await chromium.launch({ headless: true, executablePath: chromePath || undefined });
try {
  const userContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const userPage = await userContext.newPage();

  await login(userPage, userId);
  await userPage.goto(`${web}/interview/${start.interviewId}`, { waitUntil: 'networkidle' });
  await userPage.getByRole('heading', { name: '请先确认简历信息' }).waitFor({ state: 'visible' });
  check('resume confirmation displays parsed candidate data', await userPage.getByText('Li Ming', { exact: true }).count() === 1);
  await userPage.screenshot({ path: join(outputDir, '09-resume-confirmation.png'), fullPage: true });
  await userContext.close();

  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const adminPage = await adminContext.newPage();
  await login(adminPage, 'admin-acceptance');
  await adminPage.goto(`${web}/question-bank`, { waitUntil: 'networkidle' });
  const searchTab = adminPage.getByRole('button', { name: '🔍 语义搜索' });
  await searchTab.click();
  const searchInput = adminPage.getByPlaceholder('如：分布式限流 / MySQL 索引 / RAG');
  await searchInput.fill('TypeScript union types');
  const searchButton = adminPage.getByRole('button', { name: '语义搜索（同时搜索题库和知识库）' });
  await searchButton.click();
  await adminPage.waitForTimeout(1000);
  const resultCards = adminPage.locator('.bg-white.rounded-xl.border.border-slate-200.p-4.cursor-pointer');
  check('admin question-bank search renders imported TypeScript content', await resultCards.count() > 0);
  await adminPage.screenshot({ path: join(outputDir, '10-question-bank-url-search.png'), fullPage: true });
  await adminContext.close();
} finally {
  await browser.close();
}

writeFileSync(join(outputDir, 'content-screenshot-results.json'), `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  checks,
  screenshots: ['09-resume-confirmation.png', '10-question-bank-url-search.png'],
}, null, 2)}\n`);
