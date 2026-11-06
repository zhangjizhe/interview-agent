/** GET-only retries for durable jobs; a lost POST receipt must never trigger a new evaluation. */
export async function pollEvaluation(read, { now = Date.now, wait = ms => new Promise(resolve => setTimeout(resolve, ms)), timeoutMs = 120000 } = {}) {
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    const result = await read();
    if (result.status === 429) { await wait(Math.min(10000, Math.max(0, deadline - now()))); continue; }
    if (result.status !== 200) throw new Error(`Evaluation read rejected: HTTP ${result.status}`);
    if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(result.data?.status)) return result.data;
    if (!['PENDING', 'RUNNING'].includes(result.data?.status)) throw new Error('Unknown evaluation state');
    await wait(Math.min(1000, Math.max(0, deadline - now())));
  }
  throw new Error('Evaluation read deadline exceeded; existing job is not resubmitted');
}
