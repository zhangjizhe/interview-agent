import assert from 'node:assert/strict';

/** Injected DELETE refusal without forwarding, not a natural storage fault. */
export async function verifyQuestionDeleteFailure(page, context, origin, saved, snapshot) {
  assert.equal(process.env.LAB_FIXTURE_SYNTHETIC, '1');
  assert.equal(origin, 'http://localhost:5176');
  const token = await page.evaluate(() => localStorage.getItem('ia_access_token'));
  assert.ok(token);
  const path = `/api/interview/question-bank/${encodeURIComponent(saved.questionId)}`;
  const pattern = `${origin}${path}`;
  const article = page.locator('article.question-bank-row').filter({ has: page.getByRole('heading', { name: saved.question, exact: true }) });
  const requests = [];
  const observe = request => { if (request.method() === 'DELETE' && new URL(request.url()).pathname === path) requests.push(request); };
  let injections = 0;
  const handler = async route => {
    injections++;
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Synthetic delete refused' }) });
  };
  const before = await snapshot();
  page.on('request', observe);
  await page.route(pattern, handler, { times: 1 });
  try {
    const response = page.waitForResponse(item => new URL(item.url()).pathname === path && item.request().method() === 'DELETE');
    void response.catch(() => {});
    page.once('dialog', dialog => dialog.accept());
    await article.getByTitle('删除题目').click();
    assert.equal((await response).status(), 503);
    await page.getByRole('alert').filter({ hasText: '题目删除失败，请刷新核验后重试。' }).waitFor();
    await page.waitForFunction(() => { const button = document.querySelector('article.question-bank-row button[title="删除题目"]'); return button && !button.disabled; });
    assert.equal(await article.getByTitle('删除题目').isEnabled(), true);
    assert.equal(await article.isVisible(), true);
    const actual = await context.request.get(`${origin}/api/interview/question-bank/list?limit=50`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(actual.status(), 200);
    const retained = (await actual.json()).results.find(row => row.questionId === saved.questionId);
    assert.ok(retained);
    for (const key of ['questionId', 'position', 'level', 'category', 'question', 'answer', 'tags']) assert.deepEqual(retained[key], saved[key]);
    assert.equal(await page.evaluate(() => localStorage.getItem('ia_access_token')), token);
    assert.equal(injections, 1);
    assert.equal(requests.length, 1);
    assert.deepEqual(await snapshot(), before);
  } finally {
    await page.unroute(pattern, handler);
    page.off('request', observe);
  }
}
