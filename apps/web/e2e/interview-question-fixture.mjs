import assert from 'node:assert/strict';

const origin = 'http://localhost:5177';
export async function assertPresentedQuestion(page, interviewId, receipt) {
  assert.equal(process.env.LAB_FIXTURE_SYNTHETIC, '1');
  assert.equal(new URL(page.url()).origin, origin);
  assert.equal(receipt.success, true); assert.equal(receipt.questionProtocol, 'presentation/v1');
  const question = receipt.currentQuestion; assert.ok(question && question.state === 'OPEN');
  for (const key of ['presentationId', 'taskId', 'messageId', 'question']) assert.ok(typeof question[key] === 'string' && question[key].trim());
  const token = await page.evaluate(() => localStorage.getItem('ia_access_token')); assert.ok(token);
  const response = await page.request.get(`${origin}/api/interview/${interviewId}`, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 });
  assert.equal(response.status(), 200); const current = await response.json();
  assert.equal(current.questionProtocol, 'presentation/v1'); assert.deepEqual(current.currentQuestion, question);
  assert.ok(current.messages.some(message => message.id === question.messageId && message.role === 'assistant' && message.content === question.question));
  await page.getByRole('region', { name: '当前题目', exact: true }).getByText(question.question, { exact: true }).waitFor();
  const composer = page.getByPlaceholder('输入当前题目的回答...', { exact: true });
  await composer.waitFor(); assert.equal(await composer.isEnabled(), true);
  return page.locator('textarea');
}

// Provider-free confirmation through the actual UI/API. Never fabricate a
// receipt or seed an answer to bypass the current-question input gate.
export async function prepareQuestion(page, interviewId) {
  assert.equal(process.env.LAB_FIXTURE_SYNTHETIC, '1');
  assert.equal(new URL(page.url()).origin, origin);
  assert.equal(new URL(page.url()).pathname, `/interview/${interviewId}`);
  const response = page.waitForResponse(r => r.url() === `${origin}/api/interview/${interviewId}/confirm-resume` && r.request().method() === 'POST', { timeout: 15000 }); response.catch(() => undefined);
  await page.getByRole('button', { name: '核验题目状态', exact: true }).click();
  const confirmed = await response; assert.equal(confirmed.status(), 201);
  return assertPresentedQuestion(page, interviewId, await confirmed.json());
}
