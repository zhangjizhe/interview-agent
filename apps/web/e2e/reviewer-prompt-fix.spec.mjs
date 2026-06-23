/**
 * Playwright E2E - Reviewer prompt 追问重复开场白 bug 验证
 *
 * 用户报告：第二轮及以后回复包含"那咱们立刻切换到 AI Agent 开发的赛道...
 * 来第一问"等开场白模板。
 *
 * 修复：
 * - reviewer.ts 加 roundCount 计算（user message 数 / 2）
 * - 第 2 轮及以后 prompt 显式告诉 LLM "这是追问，不要重复开场白"
 * - pastStepsSummary 只取最近 3 步
 *
 * 验证：
 * - 跑 4 轮真实对话（用户原 case）
 * - 检查每轮 assistant 消息是否含"那咱们立刻切换"/"切换赛道"/"来第一问"等开场白模板
 * - 截图保存
 */
import { chromium } from 'playwright';
import { writeFileSync, readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = join(__dirname, 'screenshots');
mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const CHROME_PATH = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const WEB_URL = process.env.WEB_URL || 'http://localhost:5173';
const API_URL = process.env.API_URL || 'http://localhost:3001';

// 开场白模板关键词（命中 = bug 复现）
// 排除正常过渡话术："咱们先从基础开始" 是合理的对话推进
const OPENING_PATTERNS = [
  /那咱们立刻切换/,
  /切换.*赛道/,
  /来第一问[：:]/,
  /很高兴.*一起进行/,
  /欢迎.*来到面试/,
  /今天和你一起进行这场/,
  /咱们立刻/,
  /AI Agent 开发的赛道/,
];

async function main() {
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();

  let pass = 0, fail = 0;
  const ok = (label, cond, detail) => {
    if (cond) { console.log(`  ✅ ${label}${detail ? ` — ${detail}` : ''}`); pass++; }
    else { console.error(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); fail++; }
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // 创建 interview + 上传简历
  console.log('\n━━━ Setup: create interview + upload resume ━━━');
  const userId = 'reviewer-fix-' + Date.now();
  await page.request.post(`${API_URL}/api/user`, { data: { email: `${userId}@test.local`, name: '哲哥测试' } });
  writeFileSync('/tmp/reviewer-resume.md', '# 张继哲\n## 技能\nReact, TypeScript, Node.js, 5年前端经验\n## 项目\n- 京东外卖频道（适配器模式封装 SDK）\n- 暖哇保险客服系统');
  await page.request.post(`${API_URL}/api/interview/upload-resume`, {
    multipart: {
      file: { name: 'resume.md', mimeType: 'text/markdown', buffer: readFileSync('/tmp/reviewer-resume.md') },
      userId,
      position: '前端开发工程师',
    },
  });
  const startRes = await page.request.post(`${API_URL}/api/interview/start`, {
    data: { userId, position: '前端开发工程师', level: 'P5', resumeConfirmed: true },
  });
  const startData = await startRes.json();
  const intId = startData.interview?.id || startData.id;
  ok('interview created', !!intId, `id=${intId}`);

  await page.goto(`${WEB_URL}/interview/${intId}?userId=${userId}`, { waitUntil: 'networkidle' });
  await sleep(2500);

  // 确认简历
  const confirmBtn = page.locator('button:has-text("确认")').first();
  if (await confirmBtn.count() > 0 && await confirmBtn.isVisible()) {
    await confirmBtn.click({ force: true }).catch(() => {});
    await sleep(1500);
  }

  const textarea = page.locator('textarea').first();
  const sendBtn = page.locator('button.bg-blue-600').last();
  await textarea.waitFor({ state: 'visible' });
  for (let i = 0; i < 15; i++) {
    if (await sendBtn.isEnabled()) break;
    await sleep(1000);
  }

  // 4 轮对话（用户原 case）
  const rounds = [
    { name: 'r1-start', question: '开始吗？' },
    { name: 'r2-stack', question: '面试全栈agent偏前端的岗位' },
    { name: 'r3-nuanwa', question: '我在暖哇科技做了个保险客服系统，用 React + TypeScript 从 0 到 1 搭建前端，适配器模式封装了不同厂商的软电话 SDK。' },
    { name: 'r4-adapter', question: '适配器模式具体怎么设计？SDK 接口差异大时怎么解决？' },
  ];

  for (const round of rounds) {
    console.log(`\n━━━ Round ${round.name}: "${round.question.slice(0, 30)}..." ━━━`);
    await textarea.fill(round.question);
    const sendTs = Date.now();
    await sendBtn.click({ force: true });

    // 等 [DONE]
    for (let i = 0; i < 90; i++) {
      await sleep(1000);
      const done = await page.evaluate(() => {
        const msgs = window.__sseEvents || [];
        return msgs.some(e => e.type === '[DONE]' || e.type === 'done');
      });
      if (done) break;
    }
    const elapsed = Math.round((Date.now() - sendTs) / 1000);
    await sleep(2000);

    // 抓取最后一条 assistant 消息
    const lastAssistant = await page.evaluate(() => {
      const bubbles = document.querySelectorAll('.flex.gap-2, .flex.gap-3');
      const messages = [];
      for (const b of bubbles) {
        const isAssistant = b.querySelector('.bg-white, .border-slate-200') !== null;
        const text = b.textContent?.trim() || '';
        if (isAssistant && text) messages.push(text);
      }
      return messages[messages.length - 1] || '';
    });

    // 检查开场白模板
    const openingHits = OPENING_PATTERNS.filter(p => p.test(lastAssistant));
    console.log(`  assistant 消息前 80 字: "${lastAssistant.slice(0, 80)}..."`);
    console.log(`  开场白模板命中: ${openingHits.length} 个${openingHits.length > 0 ? ` [${openingHits.map(p => p.source).join(', ')}]` : ''}`);

    if (round.name === 'r1-start') {
      // R1 期望：可以有开场白（首问），但不应有"那咱们立刻切换" / "来第一问"
      const badHits = openingHits.filter(p =>
        p.source.includes('切换') || p.source.includes('来第一问')
      );
      ok(`R1 没有"切换赛道"/"来第一问"模板`, badHits.length === 0);
    } else {
      // R2-R4 严格断言：不能含任何开场白模板
      ok(`R${round.name} 没有追问时的开场白模板`, openingHits.length === 0,
        openingHits.length > 0 ? `命中: ${openingHits.map(p => p.source).join(', ')}` : '');
    }

    // 截图
    await page.screenshot({ path: join(SCREENSHOTS_DIR, `reviewer-${round.name}.png`), fullPage: false });

    // 检查输入框是否已切回（每轮结束后）
    const sendBtnState = await page.evaluate(() => {
      const btn = document.querySelector('button.bg-blue-600');
      return btn ? { hasLoader: btn.querySelector('.animate-spin') !== null, isDisabled: btn.disabled } : { hasLoader: false, isDisabled: true };
    });
    ok(`R${round.name} 发送按钮 loading 已切回 (${elapsed}s)`, !sendBtnState.hasLoader && !sendBtnState.isDisabled);
  }

  await browser.close();

  console.log(`\n━━━ Result ━━━`);
  console.log(`✅ Passed: ${pass}  ❌ Failed: ${fail}`);
  console.log(`📸 Screenshots: ${SCREENSHOTS_DIR}`);
  if (fail > 0) process.exit(1);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
