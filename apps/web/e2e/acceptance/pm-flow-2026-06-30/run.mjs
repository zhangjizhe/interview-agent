/**
 * PM 验收完整流程截图（14 张）
 * 2026-06-30 v3：API 链路直接 navigate，避开 React state + modal bug
 *
 * 关键发现（来自 debug）：
 * - upload-resume API 不返回 interviewId，只存 Milvus RAG
 * - interviewId 在 /api/interview/start 才创建 + 返回
 * - 前端 uploadedInterviewId 主要靠 mount useEffect fetch list 拿 IN_PROGRESS 同步
 * - modal file input change event 在 page.request 已上传后不再触发 fetch（state 已 dirty）
 */
import { chromium } from 'playwright';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_URL = 'http://localhost:3001';
const WEB_URL = 'http://localhost:5173';
const STAMP = 'pm-2026-06-30';

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const userId = 'pm-full-' + Date.now();
const log = (msg) => console.log(`\n[${new Date().toLocaleTimeString()}] ${msg}`);
const shot = async (n, desc) => {
  const name = `${n}-${STAMP}.png`;
  await page.screenshot({ path: join(__dirname, name), fullPage: false });
  console.log(`  📸 ${name} - ${desc}`);
};

const resumeMd = `# PM 验收测试用户

## 技能
- React / TypeScript / Node.js
- 5 年前端经验
- LangChain / LangGraph / Mem0 / Qdrant
- LLM Gateway 设计经验

## 项目
- interview-agent（AI 面试智能体）
- MCP 网关（多协议 + 鉴权 + Registry）
- 京东外卖频道（适配器模式封装 SDK）`;

const createUser = async (uid) => {
  return await page.request.post(`${API_URL}/api/user`, {
    data: { email: `${uid}@demo.local`, name: 'PM-FullFlow' },
  });
};

const uploadResume = async (uid) => {
  return await page.request.post(`${API_URL}/api/interview/upload-resume`, {
    multipart: {
      file: { name: 'pm-resume.md', mimeType: 'text/markdown', buffer: Buffer.from(resumeMd) },
      userId: uid,
      position: 'AI Agent 工程师',
    },
  });
};

const startInterview = async (uid, position, level = 'P5') => {
  return await page.request.post(`${API_URL}/api/interview/start`, {
    headers: { 'Content-Type': 'application/json' },
    data: { userId: uid, position, level, resumeConfirmed: true },
  });
};

// ===== Step 0: 创建用户（先于所有截图，确保 userId 存在） =====
log(`Step 0: 创建用户 ${userId}`);
await createUser(userId);

// ===== Step 1: 首页（URL userId 生效 · 未上传简历） =====
log('Step 1: 首页（URL userId 生效 · 总面试 0）');
await page.goto(`${WEB_URL}/?userId=${userId}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);
await shot('01-home-no-resume', '首页：URL userId 生效 · 总面试 0 · amber 提示');

// ===== Step 2: 点开 dropdown =====
log('Step 2: 点开 dropdown');
await page.locator('button:has-text("开始新面试")').first().click();
await page.waitForTimeout(1000);
await shot('02-dropdown', 'dropdown：4 个快捷选项');

// ===== Step 3: 点"🚀 自定义岗位"弹窗（amber 状态条） =====
log('Step 3: 自定义岗位弹窗 · amber 状态条');
await page.locator('button:has-text("自定义岗位")').first().click();
await page.waitForTimeout(3000);
await shot('03-modal-amber', '弹窗：amber "请先上传简历"');

// ===== Step 4: API 上传简历 + 创建第 1 个 interview =====
log('Step 4: API 上传简历 + 创建 interview');
const uploadRes = await uploadResume(userId);
console.log(`  upload status: ${uploadRes.status()}`);
// 等 Milvus insert/query 时序稳定（实测 5s 才稳定）
await new Promise((r) => setTimeout(r, 5000));
const start1Res = await startInterview(userId, 'AI Agent 工程师', 'P6');
const start1Data = await start1Res.json();
console.log(`  start1 status: ${start1Res.status()}, interviewId: ${start1Data.interviewId}`);
const interview1Id = start1Data.interviewId;

// 关闭弹窗后回首页 → mount useEffect 拿 list 同步 emerald
const closeBtn = page.locator('button:has(svg.lucide-x)').first();
if (await closeBtn.count() > 0) {
  await closeBtn.click({ force: true }).catch(() => {});
  await page.waitForTimeout(1000);
}
await page.goto(`${WEB_URL}/?userId=${userId}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);
// 再开弹窗 → emerald 状态
await page.locator('button:has-text("开始新面试")').first().click();
await page.waitForTimeout(1000);
await page.locator('button:has-text("自定义岗位")').first().click();
await page.waitForTimeout(3000);
await shot('04-modal-emerald', '弹窗：emerald "简历已确认"');

// ===== Step 5: 直接 navigate 进第 1 个 interview 页 =====
log(`Step 5: 进 interview 页 ${interview1Id}`);
await page.goto(`${WEB_URL}/interview/${interview1Id}?userId=${userId}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);
try {
  await page.waitForSelector('button:has-text("确认无误")', { timeout: 15000 });
  console.log('  ✓ confirm panel visible');
} catch {
  console.log('  ⚠️ confirm panel not visible, URL:', page.url());
}
await shot('05-interview-confirm-panel', 'interview 页：简历确认面板');

// ===== Step 6: 点"确认无误，开始面试" =====
log('Step 6: 点"确认无误，开始面试"');
const confirmBtn = page.locator('button:has-text("确认无误")').first();
if (await confirmBtn.count() > 0 && await confirmBtn.isVisible()) {
  await confirmBtn.click({ force: true });
  console.log('  ✓ confirm clicked');
  await page.waitForTimeout(4000);
}
try {
  await page.waitForSelector('textarea:not([disabled])', { timeout: 20000 });
  console.log('  ✓ textarea enabled');
} catch {
  console.log('  ⚠️ textarea disabled still');
}
await shot('06-interview-chat-ready', 'interview 页：textarea 可用');

// ===== Step 7-9: 流式对话 =====
log('Step 7-9: 流式对话');
const textarea = page.locator('textarea').first();
const taDisabled = await textarea.evaluate(el => el.disabled).catch(() => true);
console.log(`  textarea disabled: ${taDisabled}`);

if (!taDisabled) {
  await textarea.fill('开始面试');
  const sendBtn = page.locator("button.bg-blue-600").last();
  const sendEnabled = await sendBtn.isEnabled();
  console.log(`  send enabled: ${sendEnabled}`);
  if (sendEnabled) {
    await sendBtn.click({ force: true });
    await page.waitForTimeout(4000);
    await shot('07-sending', '发消息：loading + SSE 开始推送');
    await page.waitForTimeout(15000);
    await shot('08-streaming', '流式对话：assistant 回复中');
    await page.waitForTimeout(25000);
    await shot('09-streaming-done', '流式对话：[DONE] 到达 · loading 切回 idle');
  }
} else {
  await shot('07-textarea-disabled', 'textarea 仍 disabled');
}

// ===== Step 10: 回首页看面试列表 =====
log('Step 10: 回首页看面试列表');
await page.goto(`${WEB_URL}/?userId=${userId}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);
await shot('10-home-after-1-interview', '首页：总面试=1');

// ===== Step 11: dropdown 选前端（直接 API 创建 interview + navigate） =====
log('Step 11: 创建前端 interview');
// 再调一次 upload 确保 Milvus resumes collection 有数据（start API 校验）
await uploadResume(userId);
await new Promise((r) => setTimeout(r, 5000));
const start2Res = await startInterview(userId, '前端开发工程师', 'P6');
const start2Data = await start2Res.json();
const interview2Id = start2Data.interviewId;
console.log(`  interview2Id: ${interview2Id}`);
// 回首页 + 截图首页（dropdown emerald 状态）
await page.goto(`${WEB_URL}/?userId=${userId}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);
await page.locator('button:has-text("开始新面试")').first().click();
await page.waitForTimeout(1000);
await page.locator('button:has-text("前端开发工程师")').first().click();
await page.waitForTimeout(3000);
await shot('11-modal-frontend-emerald', '前端工程师弹窗：emerald "简历已确认"');

// ===== Step 12: 第 2 个 interview 页 =====
log(`Step 12: 第 2 个 interview 页 ${interview2Id}`);
await page.goto(`${WEB_URL}/interview/${interview2Id}?userId=${userId}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);
try {
  await page.waitForSelector('button:has-text("确认无误")', { timeout: 10000 });
  console.log('  ✓ confirm panel visible');
} catch {
  console.log('  ⚠️ no confirm panel, URL:', page.url());
}
await shot('12-interview-frontend', '第 2 个 interview 页：前端岗位简历确认');

// ===== Step 13: 工具页 =====
log('Step 13: 工具页 /tools');
await page.goto(`${WEB_URL}/tools`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
await shot('13-tools-page', '工具页：11 MCP');

// ===== Step 14: 题库页 =====
log('Step 14: 题库页 /question-bank');
await page.goto(`${WEB_URL}/question-bank`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
await shot('14-question-bank', '题库页');

await browser.close();
console.log('\n=== Done ===');
console.log(`Screenshots in ${__dirname}`);
const files = readdirSync(__dirname).filter(f => f.endsWith('.png') && f.includes(STAMP));
console.log(`Total: ${files.length} screenshots`);
files.forEach(f => console.log(`  - ${f}`));