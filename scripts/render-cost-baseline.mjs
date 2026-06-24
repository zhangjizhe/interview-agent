/**
 * 渲染 cost-baseline.html → cost-baseline.png（v11 真实数据）
 *
 * 用 Playwright headless Chromium 截全页 → 替换 docs/assets/cost-baseline.png
 *
 * 跑法：node scripts/render-cost-baseline.mjs
 *
 * Playwright 装在 apps/web/node_modules（pnpm monorepo workspace），
 * 这里用绝对路径 require 跨 workspace 加载。
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
const page = await browser.newPage({ viewport: { width: 1400, height: 1900 } });
await page.goto('file://' + HTML_PATH, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.screenshot({ path: PNG_PATH, fullPage: true });
await browser.close();
console.log(`✅ Rendered: ${PNG_PATH}`);
