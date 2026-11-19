// Isolated layout regression only; never use these fixtures on a live API origin.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installMobileLayoutFixture, verifyKeyboardLayoutModels } from './mobile-layout-fixture.mjs';
const require = createRequire(new URL('../../web/package.json', import.meta.url));
const { chromium, expect } = require('playwright');
const root = fileURLToPath(new URL('../dist/', import.meta.url));
const origin = 'http://127.0.0.1:5186';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, origin).pathname);
    if (pathname.startsWith('/api/')) { response.writeHead(405); response.end(); return; }
    const path = resolve(root, pathname === '/' ? 'index.html' : pathname.slice(1));
    assert(path.startsWith(resolve(root) + sep));
    response.setHeader('Content-Type', types[extname(path)] ?? 'application/octet-stream');
    response.end(await readFile(path));
  } catch { response.writeHead(404); response.end(); }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(5186, '127.0.0.1', resolve); });
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined });
  const context = await browser.newContext();
  const page = await context.newPage();
  const { mobileMetrics, measureMobile, mobileFixture, detach } = await installMobileLayoutFixture({ page, context });
  const rows = [];
  for (const [width, height] of [[320, 568], [360, 800], [375, 667], [390, 844], [393, 852], [412, 915], [430, 932], [768, 1024], [844, 390]]) {
    await mobileMetrics(width, height);
    for (const view of ['overview', 'runtime', 'mcp', 'data', 'question-bank', 'trace', 'evaluation', 'evolution', 'experiments', 'release', 'audit', 'operations']) {
      await page.goto(`${origin}/?view=${view}`, { waitUntil: 'networkidle', timeout: 10000 });
      await page.locator('.lab-page-content').waitFor();
      const result = { view, width, height, ...await measureMobile() };
      assert(result.width <= result.layout + 1, JSON.stringify(result));
      assert.equal(result.small.length, 0, JSON.stringify(result));
      assert.equal(result.smallFonts.length, 0, JSON.stringify(result));
      rows.push(result);
    }
  }
  assert.deepEqual(mobileFixture.errors, []);
  assert.deepEqual(mobileFixture.unknown, []);
  assert.deepEqual(mobileFixture.mutations, []);
  const keyboardModels = await verifyKeyboardLayoutModels({ page, expect, mobileMetrics, measureMobile });
  assert.equal(keyboardModels.length, 3);
  await detach();
  console.log(JSON.stringify({ syntheticLayoutChecks: rows.length, syntheticKeyboardModels: keyboardModels.length, modelCalls: 0, scope: 'Chromium emulation; not physical-device or authenticated product acceptance' }));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
