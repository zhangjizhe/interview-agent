import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { join } from 'path';

const API_URL = 'http://localhost:3001';
const WEB_URL = 'http://localhost:5173';
const ASSETS = '/Users/ext.zhangjizhe1/Desktop/interview-agent/docs/assets';

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const userId = 'pm-full-flow-' + Date.now();
const stamp = '2026-06-29';

const log = (msg) => console.log(`\n[${new Date().toLocaleTimeString()}] ${msg}`);

async function shot(name, description) {
  const path = join(ASSETS, name);
  await page.screenshot({ path, fullPage: false });
  console.log(`  📸 ${name} - ${description}`);
}

// ===== Setup =====
log('Setup: create user + upload resume');
await page.request.post(`${API_URL}/api/user`, {
  data: { email: `${userId}@demo.local`, name: 'PM-FullFlow' },
});
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
await page.request.post(`${API_URL}/api/interview/upload-resume`, {
  multipart: {
    file: { name: 'pm-resume.md', mimeType: 'text/markdown', buffer: Buffer.from(resumeMd) },
    userId,
    position: 'AI Agent 工程师',
  },
});

// ===== Step 1: 首页（URL userId 生效） =====
log('Step 1: 首页（URL userId 生效）');
await page.goto(`${WEB_URL}/?userId=${userId}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
await shot(`pm-01-home-fixed-${stamp}.png`, '首页：URL userId 生效 · 当前用户=pm-full-flow-xxx · 总面试 0/0/0');

// ===== Step 2: 点开 dropdown =====
log('Step 2: 点开 dropdown');
await page.locator('button:has-text("开始新面试")').first().click();
await page.waitForTimeout(800);
await shot(`pm-02-dropdown-${stamp}.png`, '+开始新面试 dropdown：4 个选项（自定义/AI Agent/前端/测试）');

// ===== Step 3: 点"🚀 自定义岗位"弹窗（amber 状态条） =====
log('Step 3: 点"🚀 自定义岗位"弹窗');
await page.locator('button:has-text("自定义岗位")').first().click();
await page.waitForTimeout(2500);
await shot(`pm-03-modal-custom-amber-${stamp}.png`, '自定义岗位弹窗：顶部 amber "请先上传简历" 状态条');

// ===== Step 4: 上传简历（emerald 状态条） =====
log('Step 4: 上传简历');
// 找简历上传按钮（弹窗里的"点击选择简历"）
const fileInput = page.locator('input[type="file"]').first();
await fileInput.setInputFiles({
  name: 'pm-resume-uploaded.md',
  mimeType: 'text/markdown',
  buffer: Buffer.from(resumeMd),
});
await page.waitForTimeout(5000); // 等 upload + parse
await shot(`pm-04-modal-resume-uploaded-${stamp}.png`, '上传简历后：顶部 emerald "简历已确认" 状态条 + 文件名');

// ===== Step 5: 点"开始面试"按钮 → interview 页 =====
log('Step 5: 点"开始面试"按钮');
await page.locator('button:has-text("开始面试")').first().click();
await page.waitForTimeout(4000);
console.log('  URL:', page.url());
await shot(`pm-05-interview-confirm-resume-${stamp}.png`, 'interview 页：简历确认面板（顶部"确认无误，开始面试"按钮）');

// ===== Step 6: 点击"确认无误，开始面试" =====
log('Step 6: 点击"确认无误"');
const confirmBtn = page.locator('button:has-text("确认无误")').first();
const confirmCount = await confirmBtn.count();
const confirmVisible = confirmCount > 0 ? await confirmBtn.isVisible() : false;
console.log(`  confirm count: ${confirmCount}, visible: ${confirmVisible}`);
if (confirmCount > 0 && confirmVisible) {
  await confirmBtn.click({ force: true });
  await page.waitForTimeout(2500);
}
await shot(`pm-06-interview-chat-ready-${stamp}.png`, 'interview 页：textarea 可用 · 简历已确认 · 准备对话');

// ===== Step 7: 发第一条消息 =====
log('Step 7: 发第一条消息');
const textarea = page.locator('textarea').first();
const taDisabled = await textarea.evaluate(el => el.disabled);
console.log(`  textarea disabled: ${taDisabled}`);
if (!taDisabled) {
  await textarea.fill('开始面试');
  const sendBtn = page.locator('button.bg-blue-600').last();
  const sendEnabled = await sendBtn.isEnabled();
  console.log(`  send enabled: ${sendEnabled}`);
  if (sendEnabled) {
    await sendBtn.click({ force: true });
    await page.waitForTimeout(3000);
    await shot(`pm-07-interview-sending-${stamp}.png`, '发消息：loading + SSE 开始推送');
    await page.waitForTimeout(15000);
    await shot(`pm-08-interview-streaming-${stamp}.png`, '流式对话：assistant 回复中（token 逐字推送）');
    await page.waitForTimeout(20000);
    await shot(`pm-09-interview-done-${stamp}.png`, '流式对话：[DONE] 到达 · loading 切回 idle');
  }
}

// ===== Step 8: 回到首页（看历史） =====
log('Step 8: 回首页看面试列表');
await page.goto(`${WEB_URL}/?userId=${userId}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
await shot(`pm-10-home-after-interview-${stamp}.png`, '回首页：当前用户=pm-full-flow · 总面试 1（新增的）');

// ===== Step 11: 点 +开始新面试 dropdown 看"🎨 前端开发工程师"快捷 =====
log('Step 11: dropdown 选前端');
await page.locator('button:has-text("开始新面试")').first().click();
await page.waitForTimeout(800);
await page.locator('button:has-text("前端开发工程师")').first().click();
await page.waitForTimeout(2500);
await shot(`pm-11-modal-frontend-${stamp}.png`, '前端开发工程师弹窗：岗位已选=前端 · amber 简历确认条');

// ===== Step 12: 直接点开始面试（简历已上传，emerald） =====
log('Step 12: emerald 弹窗 → 开始面试');
const startBtn = page.locator('button:has-text("开始面试")').first();
if (await startBtn.isEnabled()) {
  await startBtn.click();
  await page.waitForTimeout(4000);
  await shot(`pm-12-interview-frontend-${stamp}.png`, '前端面试 interview 页：第二个 interview · 简历直接可用');
}

await browser.close();
console.log('\n=== Done ===');
console.log(`Screenshots in ${ASSETS}`);