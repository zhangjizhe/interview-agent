import { chromium } from 'playwright';

const API_URL = 'http://localhost:3001';
const WEB_URL = 'http://localhost:5173';

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();

// 监听网络
page.on('response', (res) => {
  const url = res.url();
  if (url.includes('/api/')) {
    console.log(`[NET] ${res.status()} ${url}`);
  }
});

// 走真实用户路径：首页 + 点击"开始新面试"
const userId = 'home-flow-' + Date.now();

console.log('=== Step 1: 创建 user + 上传简历 ===');
await page.request.post(`${API_URL}/api/user`, {
  data: { email: `${userId}@test.local`, name: 'HomeFlow' },
});
await page.request.post(`${API_URL}/api/interview/upload-resume`, {
  multipart: {
    file: { name: 'r.md', mimeType: 'text/markdown', buffer: Buffer.from('# HomeFlow\nSkills: React, TS, Node') },
    userId,
    position: 'AI Agent',
  },
});

console.log('\n=== Step 2: 进首页 ===');
await page.goto(`${WEB_URL}/?userId=${userId}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

const homeState = await page.evaluate(() => {
  const stats = Array.from(document.querySelectorAll('.text-3xl, .text-2xl, [class*="font-bold"]')).map(e => e.textContent?.trim()).filter(Boolean);
  const navText = document.querySelector('nav')?.textContent?.slice(0, 100);
  const interviewList = document.body.textContent.includes('空面试') ? 'has empty room section' : 'no empty room section';
  const listContent = document.querySelector('main')?.textContent?.slice(0, 600);
  return { stats, navText, interviewList, listContent };
});
console.log('Home state:', JSON.stringify(homeState, null, 2));

console.log('\n=== Step 3: 看 stats 接口返回 ===');
const statsRes = await page.request.get(`${API_URL}/api/interview/stats?userId=${userId}`);
const statsBody = await statsRes.json();
console.log('stats API:', JSON.stringify(statsBody, null, 2));

const listRes = await page.request.get(`${API_URL}/api/interview/list?userId=${userId}`);
const listBody = await listRes.json();
console.log('list API:', JSON.stringify(listBody, null, 2).slice(0, 800));

console.log('\n=== Step 4: 点 "+ 开始新面试" 按钮 ===');
const startBtn = page.locator('button:has-text("开始新面试")').first();
const startBtnCount = await startBtn.count();
const startBtnVisible = startBtnCount > 0 ? await startBtn.isVisible() : false;
console.log('start btn count:', startBtnCount, 'visible:', startBtnVisible);

await startBtn.click({ force: true });
await page.waitForTimeout(3000);

console.log('After click URL:', page.url());

const afterClickState = await page.evaluate(() => {
  const ta = document.querySelector('textarea');
  const confirmBtns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.includes('确认')).map(b => ({
    text: b.textContent.slice(0, 30),
    visible: !!b.offsetParent,
  }));
  return {
    url: window.location.href,
    textareaDisabled: ta?.disabled,
    textareaPlaceholder: ta?.placeholder,
    confirmBtns,
    pageText: document.body.textContent.slice(0, 500),
  };
});
console.log('After click state:', JSON.stringify(afterClickState, null, 2));

await page.screenshot({ path: '/tmp/home-flow.png', fullPage: true });
console.log('\nScreenshot: /tmp/home-flow.png');

await browser.close();