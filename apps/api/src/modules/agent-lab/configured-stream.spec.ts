import { collectConfiguredStream } from './configured-stream';
const identity = { provider: 'qwen', model: 'synthetic-stream' };
describe('configured stream billing and terminal evidence', () => {
  it('persists a provider checkpoint before completion and preserves usage', async () => {
    const order: string[] = [];
    async function* chunks() { yield { content: 'x'.repeat(256) }; order.push('provider-next'); yield { content: 'tail' }; yield { usage: { promptTokens: 8, completionTokens: 3 }, finishReason: 'stop' as const }; }
    const result = await collectConfiguredStream(chunks(), identity, async () => { order.push('checkpoint'); });
    expect(order[0]).toBe('checkpoint'); expect(result.content).toHaveLength(260);
    expect(result).toMatchObject({ finishReason: 'stop', usage: { promptTokens: 8, completionTokens: 3 } });
  });
  it('keeps usage but fails a truncated or interrupted stream without retries', async () => {
    async function* chunks() { yield { content: 'partial', usage: { promptTokens: 5, completionTokens: 1 } }; throw new Error('disconnect'); }
    expect(await collectConfiguredStream(chunks(), identity, async () => {})).toMatchObject({ content: 'partial', finishReason: 'error', usage: { promptTokens: 5, completionTokens: 1 } });
  });
  it('does not mistake EOF without finish evidence for success', async () => {
    async function* chunks() { yield { content: 'partial' }; }
    expect((await collectConfiguredStream(chunks(), identity, async () => {})).finishReason).toBe('error');
  });
  it('preserves billing evidence if checkpoint persistence fails', async () => {
    async function* chunks() { yield { content: 'partial', usage: { promptTokens: 5, completionTokens: 1 }, finishReason: 'stop' as const }; }
    expect(await collectConfiguredStream(chunks(), identity, async () => { throw new Error('storage'); })).toMatchObject({ finishReason: 'error', usage: { promptTokens: 5, completionTokens: 1 } });
  });
});
