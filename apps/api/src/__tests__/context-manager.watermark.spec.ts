import { ContextManager } from '../modules/agent/services/context-manager.service';

describe('current context watermark and content-cache contract', () => {
  it.each([[599, 0], [600, 1], [799, 1], [800, 2], [949, 2], [950, 3]])('selects the documented tier at %s / 1000', (tokens, tier) => {
    expect(new ContextManager().compact([], tokens, 1000).tier).toBe(tier);
  });
  it('keeps recent messages and does not reuse decisions across tiers or matching prefixes', () => {
    const service = new ContextManager();
    const prefix = 'a'.repeat(256);
    const latest = { role: 'user' as const, content: 'latest protected fixture' };
    const first = [{ role: 'user' as const, content: prefix + '\n```' + 'x'.repeat(18000) + '\n```' }, latest];
    const snipped = service.compact(first, 7000, 10000);
    expect(snipped.messages[0].content).toContain('x');
    const pruned = service.compact(first, 8500, 10000);
    expect(pruned.messages[0].content).not.toContain('x');
    expect(pruned.messages[1]).toEqual(latest);
    const second = [{ role: 'user' as const, content: prefix + 'b'.repeat(18000) }, latest];
    expect(service.compact(second, 8500, 10000).messages[0].content).toBe(second[0].content);
  });
  it('propagates summary failures instead of fabricating a summary', async () => {
    await expect(new ContextManager().summarize([], '', async () => { throw new Error('fixture outage'); })).rejects.toThrow('fixture outage');
  });
});
