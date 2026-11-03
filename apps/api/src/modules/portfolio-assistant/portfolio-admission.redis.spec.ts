import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { PORTFOLIO_ADMIT_SCRIPT } from './portfolio-admission';
const url = process.env.ANSWER_CACHE_TEST_REDIS_URL;
(url ? describe : describe.skip)('Portfolio admission on actual isolated Redis (no model calls)', () => {
  let redis: Redis;
  const ownedKeys = new Set<string>();
  beforeAll(() => {
    if (!url?.endsWith('/15')) throw new Error('Only dedicated Redis database 15 is allowed');
    redis = new Redis(url, { maxRetriesPerRequest: 1 });
  });
  afterAll(async () => { if (redis) { if (ownedKeys.size) await redis.del(...ownedKeys); await redis.quit(); } });
  function batch() {
    const prefix = `portfolio-test:${randomUUID()}`;
    const shared = [`${prefix}:day`, `${prefix}:visitor`, `${prefix}:active`];
    shared.forEach(key => ownedKeys.add(key));
    const admit = (id: string, daily = 20) => {
      const keys = [`${prefix}:request:${id}`, shared[0], shared[1], shared[2], `${prefix}:record:${id}`];
      keys.forEach(key => ownedKeys.add(key));
      return redis.eval(PORTFOLIO_ADMIT_SCRIPT, 5, ...keys, id, JSON.stringify({ id }), String(daily)) as Promise<[number, string]>;
    };
    return { shared, admit, prefix };
  }
  it('atomically admits only two concurrent distinct requests and preserves their metadata', async () => {
    const b = batch();
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => b.admit(String(i))));
    expect(results.filter(([result]) => result === 1)).toHaveLength(2);
    expect(await redis.scard(b.shared[2])).toBe(2);
    expect(Number(await redis.get(b.shared[0]))).toBe(2);
    expect(Number(await redis.get(b.shared[1]))).toBe(2);
    for (const [result, id] of results) if (result === 1) expect(await redis.get(`${b.prefix}:record:${id}`)).toBe(JSON.stringify({ id }));
  });
  it('reuses one request across simultaneous submissions without charging admission twice', async () => {
    const b = batch();
    const result = await Promise.all(Array.from({ length: 10 }, () => b.admit('same')));
    expect(result.filter(([code]) => code === 1)).toHaveLength(1);
    expect(result.filter(([code]) => code === 0)).toHaveLength(9);
    expect(await redis.get(b.shared[0])).toBe('1');
  });
  it('blocks the daily finite cap and visitor cap before allocating metadata', async () => {
    const daily = batch(); expect((await daily.admit('one', 1))[0]).toBe(1);
    await redis.srem(daily.shared[2], 'one');
    expect(await daily.admit('two', 1)).toEqual([-1, 'daily']);
    expect(await redis.get(`${daily.prefix}:record:two`)).toBeNull();
    const visitor = batch();
    for (const id of ['one', 'two', 'three']) { expect((await visitor.admit(id))[0]).toBe(1); await redis.srem(visitor.shared[2], id); }
    expect(await visitor.admit('four')).toEqual([-1, 'visitor']);
    expect(await redis.get(`${visitor.prefix}:record:four`)).toBeNull();
  });
});
