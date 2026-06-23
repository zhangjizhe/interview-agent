/**
 * Playwright E2E - 防御性渲染验证
 *
 * 场景：模拟后端 /api/tools 暂时返回错误格式（502 HTML、空对象），
 * 验证前端不会因为数据格式异常崩溃到 ErrorBoundary。
 *
 * 之前 bug：用户在首页停留一会儿后报错 "Cannot read properties of undefined (reading 'map')"
 * 根因：safeJson 在 API 错误时返回 {}，toolsData.tools undefined → .map() 抛错
 * 修复：queryFn 兜底返回 {tools: []}，渲染时用 ?? [] 防御
 *
 * 退出码：0 = 全部通过
 */
import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--no-sandbox'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();

  let pass = 0, fail = 0;
  const ok = (label, cond) => {
    if (cond) { console.log(`  ✅ ${label}`); pass++; }
    else { console.error(`  ❌ ${label}`); fail++; }
  };

  // 拦截 /api/tools，让它返回空对象（模拟 safeJson 在 502 时返回 {}）
  await page.route('**/api/tools', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),  // 空对象：没有 tools 字段
    });
  });

  // 创建用户
  const userId = 'defensive-' + Date.now();
  await page.request.post('http://localhost:3001/api/user', {
    data: { email: `${userId}@test.local`, name: 'Defensive' },
  });

  // 进入首页
  console.log('\n[1/3] Visit homepage with /api/tools returning empty {}');
  await page.goto(`http://localhost:5173/?userId=${userId}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  const state1 = await page.evaluate(() => {
    const hasErrorUI = !!document.body.textContent?.includes('页面出错了') ||
                       !!document.body.textContent?.includes('Cannot read properties');
    const hasHomeContent = !!document.body.textContent?.includes('面试列表') ||
                          !!document.body.textContent?.includes('技能市场') ||
                          !!document.body.textContent?.includes('开始新面试');
    return { hasErrorUI, hasHomeContent };
  });
  ok('No ErrorBoundary shown when /api/tools returns empty {}', !state1.hasErrorUI);
  ok('Home page content still rendered', state1.hasHomeContent);

  // 拦截 /api/tools 让它返回 502
  console.log('\n[2/3] Switch /api/tools to return 502 HTML (nginx error page)');
  await page.unroute('**/api/tools');
  await page.route('**/api/tools', async (route) => {
    await route.fulfill({
      status: 502,
      contentType: 'text/html',
      body: '<html><body><h1>502 Bad Gateway</h1></body></html>',
    });
  });

  // 等待下一个 polling 周期（30s 是 /api/tools 的间隔，但首页会触发 initial fetch）
  await page.waitForTimeout(2000);
  // 手动 reload 触发新一轮 fetch
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  const state2 = await page.evaluate(() => {
    const hasErrorUI = !!document.body.textContent?.includes('页面出错了') ||
                       !!document.body.textContent?.includes('Cannot read properties');
    const hasHomeContent = !!document.body.textContent?.includes('面试列表') ||
                          !!document.body.textContent?.includes('技能市场') ||
                          !!document.body.textContent?.includes('开始新面试');
    return { hasErrorUI, hasHomeContent };
  });
  ok('No ErrorBoundary shown when /api/tools returns 502', !state2.hasErrorUI);
  ok('Home page content still rendered after 502', state2.hasHomeContent);

  // 验证 skills market 显示 0 / 0 (兜底数据)
  const skillsText = await page.evaluate(() => {
    const matches = document.body.textContent?.match(/(\d+)\s*\/\s*(\d+)\s*可用/);
    return matches ? matches[0] : null;
  });
  console.log(`  Skills market 显示: "${skillsText || '未找到'}"`);
  ok('Skills market shows fallback 0/0', skillsText === '0 / 0 可用' || skillsText === '0/0 可用');

  // 恢复 /api/tools 正常返回
  console.log('\n[3/3] Restore /api/tools normal response');
  await page.unroute('**/api/tools');
  await page.waitForTimeout(2000);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  const state3 = await page.evaluate(() => {
    const hasErrorUI = !!document.body.textContent?.includes('页面出错了');
    const skillsText = document.body.textContent?.match(/(\d+)\s*\/\s*(\d+)\s*可用/);
    return { hasErrorUI, skillsText: skillsText ? skillsText[0] : null };
  });
  ok('No ErrorBoundary after restore', !state3.hasErrorUI);
  ok('Skills market shows real count', state3.skillsText && state3.skillsText !== '0/0 可用');

  await page.screenshot({ path: '/Users/zhangjizhe/Desktop/interview-agent-2/apps/web/e2e/screenshots/3-homepage-defensive.png', fullPage: true });

  await browser.close();
  console.log(`\n━━━ Result ━━━`);
  console.log(`✅ Passed: ${pass}  ❌ Failed: ${fail}`);
  if (fail > 0) process.exit(1);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
