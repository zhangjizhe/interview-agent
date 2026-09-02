import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputDir = join(__dirname, 'screenshots', 'ui-2026-09-02');
const webUrl = process.env.WEB_URL || 'http://localhost:5173';
const chromePath = process.env.CHROME_PATH;

mkdirSync(outputDir, { recursive: true });
const checks = [];
const check = (name, passed) => {
  checks.push({ name, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`);
};

async function preparePage(context, viewport, screenshot) {
  const page = await context.newPage();
  await page.setViewportSize(viewport);
  await page.addInitScript(() => {
    localStorage.setItem('ia_access_token', 'report-ui-token');
    localStorage.setItem('ia_user_role', 'USER');
    localStorage.setItem('ia_userId', 'report-ui-user');
  });
  await page.route('**/api/interview/report-ui-1', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'report-ui-1',
        status: 'COMPLETED',
        position: 'AI Agent Engineer',
        level: 'P5',
        targetJobId: 'job-ui-1',
        report: {
          overallScore: 76,
          scores: { technical: 78, communication: 72 },
          strengths: '结构清晰',
          weaknesses: '缺少量化证据',
          suggestions: '完成一次定向训练',
        },
      }),
    });
  });
  await page.route('**/api/interview/report-ui-1/evidence', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([{
        id: 'report-evidence-1',
        reason: '回答覆盖了关键质量与成本约束。',
        missingEvidence: ['可比较的回归数据'],
        recommendation: '完成一次同数据集复测。',
        question: { question: '如何验证 Agent 的发布质量？', category: 'evaluation', difficulty: 'medium', parentQuestionId: null },
        answer: { content: '使用固定数据集比较质量、结构化输出、延迟和成本。', createdAt: '2026-09-02T00:00:00.000Z' },
      }]),
    });
  });
  await page.goto(`${webUrl}/reports/report-ui-1`, { waitUntil: 'networkidle' });
  check(`${screenshot} renders independent report`, await page.getByRole('heading', { name: 'AI Agent Engineer · P5' }).count() === 1);
  check(`${screenshot} excludes internal runtime terms`, await page.getByText(/Prompt|Token|MCP|Trace/).count() === 0);
  check(`${screenshot} exposes next training action`, await page.getByRole('link', { name: '查看训练' }).count() === 1);
  check(`${screenshot} renders evidence replay`, await page.getByText('如何验证 Agent 的发布质量？').count() === 1);
  await page.screenshot({ path: join(outputDir, screenshot), fullPage: true });
}

const browser = await chromium.launch({ headless: true, executablePath: chromePath || undefined });
try {
  await preparePage(await browser.newContext(), { width: 1440, height: 960 }, 'report-desktop.png');
  await preparePage(await browser.newContext(), { width: 390, height: 844 }, 'report-mobile.png');
} finally {
  await browser.close();
}

writeFileSync(join(outputDir, 'report-ui-results.json'), `${JSON.stringify({ checks }, null, 2)}\n`);
if (checks.some((item) => !item.passed)) process.exit(1);
