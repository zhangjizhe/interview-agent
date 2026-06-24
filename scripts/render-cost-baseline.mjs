/**
 * 渲染 cost-baseline.html → cost-baseline.png（v11 真实数据）
 *
 * 用 Playwright headless Chromium 截全页 → 替换 docs/assets/cost-baseline.png
 *
 * 跑法：node scripts/render-cost-baseline.mjs
 *
 * Playwright 装在 apps/web/node_modules（pnpm monorepo workspace），
 * 这里用绝对路径 require 跨 workspace 加载。
 *
 * Viewport 选 1100×900（贴合 frame 实际内容 1064×864）：
 * - width 1100：frame 宽度 1100（含 36px padding × 2 + 内容 1028），无左右黑边
 * - height 900：略大于 frame 实际 864，给字体加载 + reflow 余量
 * - fullPage: true：若 frame 比 viewport 高，按 scrollHeight 截全；这里实际 frame 864 ≤ 900，
 *   viewport 即真实高度
 *
 * 历史：
 * - v1（ca149ce）用 1400×1900 估算（v10 mock 数据尺寸）→ 右 336 / 下 1036 px 全黑
 * - v2（本次）改 1100×900 → 贴合 frame，去黑边
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const { chromium } = require('/Users/ext.zhangjizhe1/Desktop/interview-agent/apps/web/node_modules/playwright');

const __dirname = dirname(fileURLToPath(import.meta.url));
const HTML_PATH = join(__dirname, '../docs/assets/cost-baseline.html');
const PNG_PATH = join(__dirname, '../docs/assets/cost-baseline.png');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
await page.goto('file://' + HTML_PATH, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.screenshot({ path: PNG_PATH, fullPage: true });
await browser.close();
console.log(`✅ Rendered: ${PNG_PATH}`);
