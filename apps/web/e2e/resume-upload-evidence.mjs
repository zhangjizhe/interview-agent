import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

export async function verifyResumeUpload(page, control) {
  assert.equal(process.env.LAB_FIXTURE_SYNTHETIC, '1');
  const origin = 'http://localhost:5177';
  const api = process.env.LAB_FIXTURE_API_CONTAINER;
  assert.match(api || '', /^interview-built-check-\d+-api$/);
  const milvus = api.replace(/-api$/, '-milvus');
  const inspect = JSON.parse(execFileSync('docker', ['inspect', milvus], { encoding: 'utf8', timeout: 10000 }))[0];
  assert.equal(inspect.Name, `/${milvus}`);
  assert.deepEqual(Object.keys(inspect.NetworkSettings.Networks), [api.replace(/-api$/, '')]);
  const otherToken = await page.evaluate(() => localStorage.getItem('ia_access_token')); assert.ok(otherToken);
  let prepared = false, paused = false, context, primary;
  const unknown = '简历保存结果尚未确认，请刷新简历列表核验后再重试。';
  const controlJson = mode => JSON.parse(control(mode));
  try {
    prepared = true; const fixture = controlJson('resume-upload-prepare');
    context = await page.context().browser().newContext({ viewport: { width: 1440, height: 1000 } });
    const candidate = await context.newPage();
    await candidate.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const login = async () => {
      await candidate.getByLabel('用户名', { exact: true }).fill(fixture.userId);
      await candidate.getByLabel('密码', { exact: true }).fill('isolated-fixture-password');
      const reply = candidate.waitForResponse(r => r.url() === `${origin}/api/auth/login` && r.request().method() === 'POST'); reply.catch(() => undefined);
      await candidate.getByRole('button', { name: '登录', exact: true }).click();
      assert.equal((await reply).status(), 200);
      await candidate.locator('input[type=file]').waitFor({ state: 'attached' });
    };
    await candidate.goto(origin); await login();
    const token = await candidate.evaluate(() => localStorage.getItem('ia_access_token')); assert.ok(token);
    const ownerList = async () => {
      const response = await context.request.get(`${origin}/api/interview/resumes/${fixture.userId}`, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 });
      assert.equal(response.status(), 200); const body = await response.json(); assert.equal(body.userId, fixture.userId); assert.ok(Array.isArray(body.resumes)); return body;
    };
    assert.equal((await ownerList()).count, 0); // Prewarms the real API's lazy collection.
    let uploads = 0;
    candidate.on('request', request => { if (request.url() === `${origin}/api/interview/upload-resume` && request.method() === 'POST') uploads++; });
    paused = true; // A command timeout can leave the daemon action applied.
    execFileSync('docker', ['pause', milvus], { timeout: 10000 });
    let failedAt;
    try {
      const reply = candidate.waitForResponse(r => r.url() === `${origin}/api/interview/upload-resume` && r.request().method() === 'POST', { timeout: 20000 }); reply.catch(() => undefined);
      failedAt = Date.now();
      await candidate.locator('input[type=file]').setInputFiles({ name: 'synthetic-unknown.txt', mimeType: 'text/plain', buffer: Buffer.from('Synthetic Unknown Candidate\nTypeScript Node.js\nSynthetic unknown project') });
      const response = await reply; assert.equal(response.status(), 503); assert.equal((await response.json()).message, unknown);
      assert.ok(Date.now() - failedAt >= 4500 && Date.now() - failedAt < 18000);
      await candidate.getByRole('alert').filter({ hasText: unknown }).waitFor();
      assert.equal(await candidate.getByRole('status').filter({ hasText: '简历已更新' }).count(), 0);
      assert.equal(uploads, 1); controlJson('resume-upload-failure');
    } finally { execFileSync('docker', ['unpause', milvus], { timeout: 10000 }); paused = false; }
    // A timed-out insert is unknown, not evidence of absence. Inspect it first.
    const uncertain = controlJson('resume-upload-inspect');
    assert.ok(uncertain.rows.length <= 1); assert.ok(uncertain.rows.every(row => row.userId === fixture.userId));
    const afterFailure = await ownerList(); assert.equal(afterFailure.count, uncertain.rows.length);
    const success = candidate.waitForResponse(r => r.url() === `${origin}/api/interview/upload-resume` && r.request().method() === 'POST', { timeout: 20000 }); success.catch(() => undefined);
    await candidate.locator('input[type=file]').setInputFiles({ name: 'synthetic-confirmed.txt', mimeType: 'text/plain', buffer: Buffer.from('Synthetic Confirmed Candidate\nTypeScript React\nSynthetic confirmed project') });
    const response = await success; assert.equal(response.status(), 201); const receipt = await response.json(); assert.equal(receipt.ragIngested, true);
    await candidate.getByRole('status').filter({ hasText: '简历已更新，可以开始对应岗位的模拟面试。' }).waitFor();
    await candidate.getByRole('complementary').getByRole('button', { name: '开始模拟面试', exact: true }).waitFor();
    assert.equal(uploads, 2);
    const stored = controlJson('resume-upload-read');
    const parsed = receipt.parsed;
    const summary = `岗位: ${fixture.position}\n技能: ${parsed.skills.join('、') || '无'}\n经验: ${parsed.experience.slice(0, 3).join('; ')}\n项目: ${parsed.projects.slice(0, 2).join('、')}`;
    const matches = stored.rows.filter(row => row.summary === summary);
    assert.equal(matches.length, 1); const actual = matches[0];
    assert.equal(actual.userId, fixture.userId); assert.equal(actual.name, parsed.name || '未命名候选人');
    assert.equal(actual.position, fixture.position); assert.equal(actual.skills, parsed.skills.join('、'));
    assert.match(String(actual.id), /^\d+$/); assert.ok(Number.isFinite(Date.parse(actual.createdAt)));
    // Public reads intentionally scrub line-edge whitespace; raw Strong payload
    // was asserted above. This fixture has no parsed experience/projects.
    assert.deepEqual(parsed.experience, []); assert.deepEqual(parsed.projects, []);
    const publicSummary = `岗位: ${fixture.position}\n技能: ${parsed.skills.join('、')}\n经验:\n项目:`;
    const verifyList = async () => {
      const body = await ownerList(); const matching = body.resumes.filter(row => row.createdAt === actual.createdAt);
      assert.equal(matching.length, 1);
      for (const key of ['name', 'position', 'skills', 'createdAt']) assert.equal(matching[0][key], actual[key]);
      assert.equal(matching[0].summary, publicSummary);
    };
    await verifyList();
    const listReply = candidate.waitForResponse(r => r.url() === `${origin}/api/interview/resumes/${fixture.userId}` && r.request().method() === 'GET'); listReply.catch(() => undefined);
    await candidate.reload(); assert.equal((await listReply).status(), 200); await verifyList();
    await candidate.getByRole('complementary').getByRole('button', { name: '开始模拟面试', exact: true }).waitFor();
    await candidate.getByRole('button', { name: '退出登录', exact: true }).first().click();
    await candidate.getByLabel('用户名', { exact: true }).waitFor(); await login();
    const newToken = await candidate.evaluate(() => localStorage.getItem('ia_access_token')); assert.ok(newToken && newToken !== token);
    const restored = await context.request.get(`${origin}/api/interview/resumes/${fixture.userId}`, { headers: { Authorization: `Bearer ${newToken}` } });
    assert.equal(restored.status(), 200); assert.ok((await restored.json()).resumes.some(row => row.createdAt === actual.createdAt && row.summary === publicSummary));
    await candidate.getByRole('complementary').getByRole('button', { name: '开始模拟面试', exact: true }).waitFor();
    const denied = await context.request.get(`${origin}/api/interview/resumes/${fixture.userId}`, { headers: { Authorization: `Bearer ${otherToken}` } });
    assert.equal(denied.status(), 400); assert.ok(!(await denied.text()).includes(publicSummary));
    console.log('PASS resume upload: actual TXT unknown503 after private Milvus pause, explicit storage inspection then confirmed201/Strong owner+payload read; reload/relogin and other-user refusal, exactly two uploads, embedding+2/chat+1/LLM_CALL+1 synthetic work, no external model');
  } catch (error) { primary = error; throw error; }
  finally {
    const errors = [];
    if (paused) { try { execFileSync('docker', ['unpause', milvus], { timeout: 10000 }); } catch (error) { errors.push(error); } }
    try { await context?.close(); } catch (error) { errors.push(error); }
    if (prepared) { try { controlJson('resume-upload-cleanup'); } catch (error) { errors.push(error); } }
    if (errors.length) throw new AggregateError([...(primary ? [primary] : []), ...errors], 'Resume upload fixture cleanup failed');
  }
}
