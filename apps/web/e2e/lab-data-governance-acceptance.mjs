import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { completeEmailLogin } from './fixture-email-code.mjs';
import { verifyDataGovernance } from './lab-data-governance-evidence.mjs';
assert.equal(process.env.LAB_FIXTURE_SYNTHETIC, '1', 'Only isolated fixture data is authorized');
const origin = 'http://localhost:5176';
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
try {
  await page.goto(origin);
  await completeEmailLogin(page, { userId: 'fixture-ci-admin', password: 'isolated-fixture-password' });
  await page.getByRole('heading', { name: '控制中心', level: 1, exact: true }).waitFor();
  await verifyDataGovernance(page, context, origin);
  assert.deepEqual(errors, []);
} catch (error) {
  console.error('Synthetic data governance failure:', error);
  console.error((await page.locator('body').innerText()).slice(0, 5000));
  throw error;
} finally { await context.close(); await browser.close(); }
