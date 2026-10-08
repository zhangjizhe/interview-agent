import { SemanticCacheService, ANSWER_CACHE_TTL_SECONDS } from './semantic-cache.service';

describe('answer cache storage contract', () => {
  const params = { cacheType: 'interview_question' as const, fingerprint: 'a'.repeat(64) };
  let redis: any, cache: SemanticCacheService;
  beforeEach(() => {
    redis = { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(undefined) };
    cache = new SemanticCacheService({ get: () => undefined } as any, redis); cache.onModuleInit();
  });
  it('rejects legacy query-only requests without accessing storage', async () => {
    expect(await cache.lookup({ userId: 'legacy', query: 'question', cacheType: 'interview_question' } as any)).toEqual({ hit: false, reason: 'context' });
    cache.setAsync({ ...params, fingerprint: undefined, response: 'old' });
    expect(redis.get).not.toHaveBeenCalled(); expect(redis.set).not.toHaveBeenCalled();
  });
  it.each([
    '{invalid json', 'null', JSON.stringify({ response: 'legacy', cacheId: 'old' }),
    JSON.stringify({ contract: 'answer-cache/v2', fingerprint: 'b'.repeat(64), response: 'wrong', cacheId: 'id' }),
    JSON.stringify({ contract: 'answer-cache/v2', fingerprint: params.fingerprint, response: {}, cacheId: 'id' }),
  ])('fails closed for malformed or mismatched entry %s', async entry => {
    redis.get.mockResolvedValue(entry); expect((await cache.lookup(params)).hit).toBe(false);
  });
  it('retains blacklist even if misconfigured as whitelisted', async () => {
    const config: any = { get: (k: string) => k.endsWith('whitelist') ? 'scoring' : undefined };
    cache = new SemanticCacheService(config, redis); cache.onModuleInit();
    expect(await cache.lookup({ ...params, cacheType: 'scoring' })).toEqual({ hit: false, reason: 'whitelist' });
  });
  it('honors disabled configuration', async () => {
    cache = new SemanticCacheService({ get: (k: string) => k.endsWith('enabled') ? 'false' : undefined } as any, redis); cache.onModuleInit();
    expect(await cache.lookup(params)).toEqual({ hit: false, reason: 'disabled' });
  });
  it('snapshots asynchronous writes, validates reads and expires entries', async () => {
    const input = { ...params, response: 'complete' }; cache.setAsync(input); input.response = 'mutated';
    await new Promise(resolve => setImmediate(resolve));
    const [key, serialized, ttl] = redis.set.mock.calls[0];
    expect(ttl).toBe(ANSWER_CACHE_TTL_SECONDS); expect(key).not.toContain('complete');
    redis.get.mockResolvedValue(serialized); expect(await cache.lookup(params)).toMatchObject({ hit: true, cachedResponse: 'complete', similarity: 1 });
  });
});
