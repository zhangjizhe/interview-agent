/**
 * Playwright E2E - 完整流式对话流程
 *
 * 覆盖场景：
 * 1. 创建用户 + 上传简历 + 启动面试
 * 2. 发送消息 → SSE 流式 token 逐字推送
 * 3. [DONE] 到达 → loading 切回 idle
 * 4. 二次进入已结束面试 → 输入框禁用
 * 5. 截图保存到 e2e/screenshots/
 *
 * 运行：
 *   cd apps/web && node e2e/streaming-flow.spec.mjs
 *
 * 前置条件：
 *   - API 服务运行在 http://localhost:3001
 *   - Web 服务运行在 http://localhost:5173
 *   - 浏览器可执行：Google Chrome (macOS) 或 chromium (Linux CI)
 *
 * 退出码：
 *   0 - 全部通过
 *   1 - 任一检查失败
 */
import { chromium } from 'playwright';
import { writeFileSync, readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = join(__dirname, 'screenshots');
mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const WEB_URL = process.env.WEB_URL || 'http://localhost:5173';
const API_URL = process.env.API_URL || 'http://localhost:3001';
const CHROME_PATH = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

let pass = 0;
let fail = 0;

function ok(label, cond, detail) {
  if (cond) {
    console.log(`  ✅ ${label}${detail ? ` — ${detail}` : ''}`);
    pass++;
  } else {
    console.error(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
    fail++;
  }
}

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  console.log('━━━ Interview Agent E2E (Playwright) ━━━');
  console.log(`API: ${API_URL}  Web: ${WEB_URL}\n`);

  // ===== 浏览器初始化 =====
  console.log('[setup] Launch browser...');
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();

  // 注入 SSE 抓包 hook
  await page.addInitScript(() => {
    window.__sseEvents = [];
    window.__sseDoneSeen = false;
    const origFetch = window.fetch;
    window.fetch = async function(...args) {
      const resp = await origFetch.apply(this, args);
      const url = typeof args[0] === 'string' ? args[0] : args[0].url;
      if (url && url.includes('/message')) {
        const clone = resp.clone();
        const reader = clone.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        (async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const lines = buf.split('\n');
            buf = lines.pop() || '';
            for (const line of lines) {
              if (!line.startsWith('data:')) continue;
              const data = line.slice(5).trim();
              if (!data) continue;
              let info = { raw: data.slice(0, 60), type: 'unknown' };
              if (data === '[DONE]') info = { raw: '[DONE]', type: '[DONE]' };
              else { try { const e = JSON.parse(data); info = { raw: data.slice(0, 60), type: e.type, content: (e.content || '').slice(0, 30), error: e.error }; } catch {} }
              window.__sseEvents.push(info);
              if (data === '[DONE]') window.__sseDoneSeen = true;
            }
          }
        })();
      }
      return resp;
    };
  });

  // ===== 阶段 1：创建面试 =====
  console.log('\n[1/5] Create interview + upload resume + start');
  const userId = 'e2e-' + Date.now();
  await page.request.post(`${API_URL}/api/user`, { data: { email: `${userId}@test.local`, name: 'E2E 测试' } });
  writeFileSync('/tmp/e2e-resume.md', '# 测试候选人\n## 技能\nReact, TypeScript, 5 年前端经验\n## 项目\n- 暖哇保险客服系统');
  await page.request.post(`${API_URL}/api/interview/upload-resume`, {
    multipart: {
      file: { name: 'resume.md', mimeType: 'text/markdown', buffer: readFileSync('/tmp/e2e-resume.md') },
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

  const confirmBtn = page.locator('button:has-text("确认")').first();
  if (await confirmBtn.count() > 0 && await confirmBtn.isVisible()) {
    await confirmBtn.click({ force: true }).catch(() => {});
    await sleep(1500);
  }

  // ===== 阶段 2：发送消息 =====
  console.log('\n[2/5] Send message + wait SSE');
  const textarea = page.locator('textarea').first();
  const sendBtn = page.locator('button.bg-blue-600').last();
  await textarea.waitFor({ state: 'visible' });
  for (let i = 0; i < 15; i++) {
    if (await sendBtn.isEnabled()) break;
    await sleep(1000);
  }
  // 调试：确认 fetch hook 注入生效
  const hookInjected = await page.evaluate(() => typeof window.fetch === 'function' && window.fetch.toString().includes('origFetch'));
  console.log(`  [debug] fetch hook injected: ${hookInjected}`);
  const initialEvents = await page.evaluate(() => window.__sseEvents.length);
  console.log(`  [debug] initial __sseEvents count: ${initialEvents}`);
  await textarea.fill('开始面试');
  await sendBtn.click({ force: true });
  const sendTs = Date.now();

  // 等 [DONE]
  let doneAt = null;
  for (let i = 0; i < 90; i++) {
    await sleep(1000);
    const doneSeen = await page.evaluate(() => window.__sseDoneSeen);
    if (doneSeen) {
      doneAt = Math.round((Date.now() - sendTs) / 1000);
      break;
    }
  }
  ok('SSE [DONE] received', !!doneAt, doneAt ? `at t=${doneAt}s` : 'TIMEOUT (90s)');

  // 立即在 reload 之前抓事件（避免 reload 清空 __sseEvents）
  const eventsBeforeReload = await page.evaluate(() => {
    const events = window.__sseEvents || [];
    const byType = {};
    for (const e of events) byType[e.type] = (byType[e.type] || 0) + 1;
    return { count: events.length, byType };
  });
  console.log(`  [debug] events before reload: count=${eventsBeforeReload.count}, byType=${JSON.stringify(eventsBeforeReload.byType)}`);
  await sleep(2000);

  // ===== 阶段 3：loading 切回 =====
  console.log('\n[3/5] Verify loading state cleared');
  const stateAfter = await page.evaluate(() => {
    const btn = document.querySelector('button.bg-blue-600');
    if (!btn) return { found: false };
    return {
      found: true,
      hasLoader: btn.querySelector('.animate-spin') !== null,
      isDisabled: btn.disabled,
    };
  });
  ok('send button loading cleared', stateAfter.found && !stateAfter.hasLoader && !stateAfter.isDisabled);
  await page.screenshot({ path: join(SCREENSHOTS_DIR, '1-after-streaming.png'), fullPage: true });

  // ===== 阶段 4：SSE 事件序列验证 =====
  console.log('\n[4/5] Verify SSE event sequence');
  const events = await page.evaluate(() => window.__sseEvents);
  const byType = {};
  for (const e of events) byType[e.type] = (byType[e.type] || 0) + 1;
  console.log(`  events: ${JSON.stringify(byType)}`);
  ok('token events > 0', (byType.token || 0) > 0, `${byType.token || 0} tokens`);
  ok('thinking event present', (byType.thinking || 0) > 0);
  ok('[DONE] marker present', (byType['[DONE]'] || 0) > 0);
  ok('done event present', (byType.done || 0) > 0);
  ok('no error events', (byType.error || 0) === 0);
  console.log(`  total events: ${events.length}`);
  if (events.length > 0) {
    console.log(`  first 3 events: ${JSON.stringify(events.slice(0, 3).map(e => e.type))}`);
  }

  // ===== 阶段 5：结束面试 + 二次进入验证 =====
  console.log('\n[5/5] End interview + verify second entry is read-only');
  const endBtn = page.locator('button:has-text("结束并生成报告"), button:has-text("生成报告中")').first();
  await endBtn.click({ force: true });

  let reportShown = false;
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    const hasReport = await page.evaluate(() => !!document.querySelector('h2.text-2xl'));
    if (hasReport) { reportShown = true; break; }
  }
  ok('report shown after end', reportShown);

  await page.reload({ waitUntil: 'networkidle' });
  await sleep(2500);
  // 关键断言：报告页显示 = 聊天输入区不存在（聊天区被替换为报告视图）
  const secondEntryState = await page.evaluate(() => {
    const report = document.querySelector('h2.text-2xl');
    const textarea = document.querySelector('textarea');
    // 找 send button 用更精确的 selector：textarea 同一行 + bg-blue-600 class
    const chatInputArea = textarea?.closest('.border-t, .flex');
    const sendBtnInChatArea = chatInputArea?.querySelector('button.bg-blue-600');
    return {
      reportShown: !!report,
      textareaExists: !!textarea,
      sendBtnExists: !!sendBtnInChatArea,
    };
  });
  ok('second entry shows report (no chat)', secondEntryState.reportShown);
  ok('second entry hides textarea (chat input area removed)', !secondEntryState.textareaExists);
  ok('second entry hides send button in chat area', !secondEntryState.sendBtnExists);

  // API 双层防御验证
  const apiRes = await page.request.post(`${API_URL}/api/interview/${intId}/message`, {
    data: { userId, content: 'bypass UI' },
  });
  const apiBody = await apiRes.text();
  ok('API rejects second-send', apiBody.includes('已结束') || apiBody.includes('error'), apiBody.slice(0, 80));

  await page.screenshot({ path: join(SCREENSHOTS_DIR, '2-second-entry-report.png'), fullPage: true });

  await browser.close();

  console.log(`\n━━━ Result ━━━`);
  console.log(`✅ Passed: ${pass}`);
  console.log(`❌ Failed: ${fail}`);
  console.log(`📊 Total: ${pass + fail}`);
  console.log(`📸 Screenshots: ${SCREENSHOTS_DIR}`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
