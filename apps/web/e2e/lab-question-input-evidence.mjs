import assert from 'node:assert/strict';

/** Actual rejected API requests in an empty synthetic fixture; no successful model request. */
export async function verifyQuestionInputEvidence(page, context, origin, snapshot) {
  assert.equal(process.env.LAB_FIXTURE_SYNTHETIC, '1');
  assert.equal(origin, 'http://localhost:5176');
  assert.equal(typeof snapshot, 'function');
  const path = '/api/interview/question-bank';
  const form = page.locator('form.question-bank-create');
  const fields = form.locator('input, textarea');
  assert.equal(await fields.count(), 6);
  const token = await page.evaluate(() => localStorage.getItem('ia_access_token'));
  assert.ok(token);
  const posts = [];
  const record = request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === path) posts.push(request);
  };
  const values = async () => Promise.all((await fields.all()).map(field => field.inputValue()));
  const unchangedEmptyStore = async () => {
    const response = await context.request.get(`${origin}${path}/list?limit=50`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(response.status(), 200);
    const body = await response.json();
    assert.deepEqual(body.results, []);
    assert.equal(body.count, 0);
    assert.equal(await page.locator('article.question-bank-row').count(), 0);
  };
  page.on('request', record);
  try {
    assert.equal(await fields.nth(3).inputValue(), '');
    assert.equal(await fields.nth(4).inputValue(), '');
    const nativeBefore = await snapshot();
    assert.equal(await form.evaluate(element => element.checkValidity()), false);
    await form.getByRole('button', { name: '保存题目', exact: true }).click();
    // A real browser task boundary lets the form submission event finish.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(posts.length, 0);
    assert.deepEqual(await snapshot(), nativeBefore);
    await unchangedEmptyStore();

    for (const [question, answer] of [['   ', 'Synthetic valid answer'], ['测'.repeat(1000), '测'.repeat(2000)]]) {
      const input = ['Synthetic Input', 'P5', 'Design', question, answer, 'fixture'];
      for (let i = 0; i < input.length; i++) await fields.nth(i).fill(input[i]);
      assert.equal(await form.evaluate(element => element.checkValidity()), true);
      if (question !== '   ') {
        assert.ok(Buffer.byteLength(question) <= 4000);
        assert.ok(Buffer.byteLength(answer) <= 8000);
        assert.ok(Buffer.byteLength(`${question}\n\n${answer}\n\nfixture`) > 8000);
      }
      const before = await snapshot();
      const beforePosts = posts.length;
      const pending = page.waitForResponse(response => new URL(response.url()).pathname === path && response.request().method() === 'POST', { timeout: 75000 });
      void pending.catch(() => {});
      await form.getByRole('button', { name: '保存题目', exact: true }).click();
      const response = await pending;
      assert.equal(response.status(), 400);
      const body = await response.json();
      assert.notEqual(body.success, true);
      assert.ok(body.message);
      assert.deepEqual(response.request().postDataJSON(), { position: input[0], level: input[1], category: input[2], question, answer, tags: ['fixture'] });
      await page.waitForFunction(() => {
        const button = document.querySelector('form.question-bank-create button[type="submit"]');
        return button && !button.disabled && button.textContent.includes('保存题目');
      });
      await page.getByText(/若结果未知，请先刷新核验/).waitFor();
      assert.deepEqual(await values(), input);
      for (const field of await fields.all()) assert.equal(await field.isEnabled(), true);
      assert.equal(await page.getByRole('button', { name: '关闭新增', exact: true }).isEnabled(), true);
      assert.equal(posts.length, beforePosts + 1);
      await unchangedEmptyStore();
      assert.deepEqual(await snapshot(), before);
      assert.equal(posts.length, beforePosts + 1);
      assert.equal(await page.evaluate(() => localStorage.getItem('ia_access_token')), token);
    }
  } finally { page.off('request', record); }
}
