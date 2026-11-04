import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

// Synthetic browser-helper contract only: no product DB, SMTP or models.
const helperUrl = process.argv[2]
  ? pathToFileURL(resolve(process.argv[2])).href
  : new URL('./fixture-email-code.mjs', import.meta.url).href;
const { completeEmailLogin } = await import(helperUrl);
const password = 'synthetic-helper-password';
let posts = 0;
const server = createServer(async (req, res) => {
  if (req.url === '/api/auth/login') {
    let body = '';
    for await (const chunk of req) body += chunk;
    const data = JSON.parse(body);
    assert.equal(data.password, password);
    posts += 1;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh' }));
    return;
  }
  const transition = req.url !== '/invalid';
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<form><label>用户名<input id="user" required ${transition ? '' : 'pattern="never-match"'}></label><label>密码<input id="password" type="password" required minlength="12"></label><button>${transition ? '验证并创建账号' : '登录'}</button></form><script>document.querySelector('form').onsubmit=async event=>{event.preventDefault();await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:document.querySelector('#user').value,password:document.querySelector('#password').value})})}</script>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined });
  const page = await browser.newPage();
  await page.goto(origin);
  const attempt = completeEmailLogin(page, { userId: 'fixture-helper', password, responseTimeoutMs: 3000 });
  void attempt.catch(() => {});
  // Model the real registration response clearing the controlled password as
  // the login form appears. The helper must wait before filling either field.
  await Promise.race([
    page.waitForFunction(() => document.querySelector('#password').value.length > 0, undefined, { timeout: 1000 }).catch(() => {}),
    new Promise(resolve => setTimeout(resolve, 500)),
  ]);
  await page.evaluate(() => {
    document.querySelector('#password').value = '';
    document.querySelector('button').textContent = '登录';
  });
  let deadline;
  try {
    const result = await Promise.race([
      attempt,
      new Promise((_resolve, reject) => { deadline = setTimeout(() => reject(new Error('Registration transition blocked native authentication POST')), 4000); }),
    ]);
    assert.equal(result.accessToken, 'synthetic-access');
    assert.equal(posts, 1);
  } finally { clearTimeout(deadline); }
  await page.goto(`${origin}/invalid`);
  await assert.rejects(
    completeEmailLogin(page, { userId: 'fixture-helper', password, responseTimeoutMs: 250 }),
    /No authentication response/,
  );
  assert.equal(posts, 1, 'Invalid native form must never submit an authentication POST');
  console.log('PASS synthetic login-helper contract: registration transition precedes password fill; missing POST fails within bounded time. No product API/mail/model acceptance.');
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
