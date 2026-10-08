#!/usr/bin/env -S npx tsx
/** 50 actual Redis checks of answer-cache/v2. Synthetic, no model or embedding. */
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
async function main() {
const product = createRequire(resolve(__dirname, '../apps/api/package.json'));
const Redis = product('ioredis');
const { SemanticCacheService } = product('./dist/modules/llm/cache/semantic-cache.service');
const { answerCacheFingerprint } = product('./dist/modules/llm/cache/answer-cache.fingerprint');
const redisUrl = process.env.CACHE_BENCH_REDIS_URL;
if (!redisUrl) throw new Error('Set CACHE_BENCH_REDIS_URL explicitly; build API first. No .env is loaded.');
const client = new Redis(redisUrl, { maxRetriesPerRequest: 1 });
const keys = new Set<string>();
const cache = new SemanticCacheService({ get: () => undefined }, {
  get: (key: string) => client.get(key),
  set: async (key: string, value: string, ttl: number) => { keys.add(key); await client.set(key, value, 'EX', ttl); },
});
cache.onModuleInit();
const fixture = randomUUID();
const elapsed: number[] = []; let hits = 0; let passed = 0;
try {
  for (let round = 0; round < 5; round++) {
    for (let index = 0; index < 10; index++) {
      const params = { messages: [{ role: 'system', content: 'synthetic policy' }, { role: 'user', content: round === 2 ? `paraphrase-${index}` : `fixture-${index}` }], interviewId: fixture };
      const fingerprint = answerCacheFingerprint(params, { organizationId: round === 4 ? 'other-fixture-org' : 'fixture-org', userId: 'fixture-user' }, { name: 'offline-fixture', defaultModel: 'offline-fixture', revision: round === 3 ? 'updated-alias' : 'initial-alias' }, { planId: 'fixture', maxInputBytes: 64000, maxOutputTokens: 100, monthlyLlmCalls: 100 }, 'chat');
      assert.ok(fingerprint);
      const started = performance.now(); const result = await cache.lookup({ cacheType: 'interview_question', fingerprint });
      elapsed.push(performance.now() - started);
      assert.equal(result.hit, round === 1, 'only identical complete requests may hit');
      if (result.hit) hits++;
      else cache.setAsync({ cacheType: 'interview_question', fingerprint, response: 'synthetic fixture answer' });
      await new Promise(done => setImmediate(done)); await client.ping(); passed++;
    }
  }
  elapsed.sort((a, b) => a - b);
  console.log(JSON.stringify({ contract: 'answer-cache/v2', evidenceType: 'synthetic-redis-contract', checks: passed, requests: 50, hits, misses: 50 - hits, redisLookupP95Ms: Number(elapsed[47].toFixed(3)), modelCalls: 0, embeddingCalls: 0, realFeeComparison: null, productionHitRate: null }));
} finally { if (keys.size) await client.del(...keys); await client.quit(); }

}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
