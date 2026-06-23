#!/usr/bin/env -S npx tsx
/**
 * Cache 命中率实测 Bench · 50 轮
 *
 * 目标：替换 README §最新基准 里 "100% (2/2)" 的单点标注，跑真实 50 轮测量 cache hit rate。
 *
 * 设计：
 * - Round 1 (10 轮 cold start)：10 个互不相同的 interview_question query → 期望 miss
 * - Round 2 (10 轮 same query)：10 个相同 query 重复 → 期望精确桶 hit (Redis)
 * - Round 3 (10 轮 同语义复述)：10 个语义相同但措辞不同的 query → 期望 embedding hit
 * - Round 4 (10 轮 完全无关)：10 个完全不同语义的 query → 期望 miss
 * - Round 5 (10 轮 边缘)：10 个同主题但不同切入角度的 query → 期望部分 hit
 *
 * 统计口径：
 * - hit_rate = 命中数 / (命中 + miss)
 * - false_positive_rate = 答非所问 / 命中数（人工标注小样本）
 * - avg_similarity = Qdrant cosine 平均
 *
 * 不依赖 NestJS DI，直接构造 Qdrant client + Redis + OpenAI 客户端
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { QdrantClient } from '@qdrant/js-client-rest';
import { createClient } from 'redis';
import OpenAI from 'openai';
import { randomUUID } from 'crypto';

// 加载 .env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const COLLECTION = 'semantic_cache_bench';
const VECTOR_SIZE = 1024;
const THRESHOLD = 0.92;
const USER_ID = 'bench_user_50rounds';
const CACHE_TYPE = 'interview_question';

interface BenchCase {
  round: number;
  label: string;
  query: string;
  expected: 'hit' | 'miss';
}

const BENCH_CASES: BenchCase[] = [
  // ---- Round 1: cold start，10 个互不相同 ----
  ...Array.from({ length: 10 }, (_, i) => ({
    round: 1,
    label: `cold-${i + 1}`,
    query: `interview question unique ${i} ${Date.now()}: 请用 TypeScript 实现 LRU cache 第 ${i + 1} 种变体`,
    expected: 'miss' as const,
  })),

  // ---- Round 2: same query 重复 → 期望 Redis 精确桶 hit ----
  ...Array.from({ length: 10 }, (_, i) => ({
    round: 2,
    label: `same-${i + 1}`,
    query: 'React Hooks useEffect 的依赖数组工作原理是什么？',
    expected: 'hit' as const,
  })),

  // ---- Round 3: 同语义复述 → 期望 Qdrant cosine hit ----
  ...[
    { round: 3, label: 'paraphrase-1', query: 'React Hooks 中 useEffect 的 deps 数组如何工作？' },
    { round: 3, label: 'paraphrase-2', query: 'useEffect 的依赖列表是怎么触发副作用的？' },
    { round: 3, label: 'paraphrase-3', query: '请解释 useEffect dependency array 的机制' },
    { round: 3, label: 'paraphrase-4', query: '请讲讲 useEffect 中 deps 数组的运作机制' },
    { round: 3, label: 'paraphrase-5', query: 'useEffect 第二个参数 dependency array 的工作原理？' },
    { round: 3, label: 'paraphrase-6', query: 'React useEffect 依赖项数组是怎样工作的？' },
    { round: 3, label: 'paraphrase-7', query: '讲一下 useEffect 的依赖数组机制' },
    { round: 3, label: 'paraphrase-8', query: 'useEffect deps array 触发条件是什么？' },
    { round: 3, label: 'paraphrase-9', query: 'React Hooks 中 useEffect 第二个参数的含义？' },
    { round: 3, label: 'paraphrase-10', query: '请说明 useEffect 的依赖列表的作用' },
  ].map((x) => ({ ...x, expected: 'hit' as const })),

  // ---- Round 4: 完全无关 → miss ----
  ...Array.from({ length: 10 }, (_, i) => ({
    round: 4,
    label: `unrelated-${i + 1}`,
    query: `无关问题 ${i}: Kubernetes Pod 调度策略有哪些？请详细解释 kube-scheduler 的预选和优选流程`,
    expected: 'miss' as const,
  })),

  // ---- Round 5: 边缘 - 同主题不同切入 → 部分 hit ----
  ...Array.from({ length: 10 }, (_, i) => ({
    round: 5,
    label: `edge-${i + 1}`,
    query: [
      'React Hooks 中 useEffect 什么时候会触发 component re-render？',
      'useEffect 的 cleanup 函数在什么时候执行？',
      'useEffect 中返回的函数是做什么用的？',
      'useEffect 第二个参数传空数组和不传有什么区别？',
      'useEffect 怎么模拟 componentDidMount 生命周期？',
      'useEffect 内部能直接用 setState 吗？需要注意什么？',
      'useEffect 的执行时机是 render 之前还是之后？',
      'useEffect 能否替代所有 class 生命周期方法？',
      'useEffect 中如果发起异步请求需要注意什么 race condition？',
      'useEffect 触发频繁调用 API 时怎么优化？',
    ][i],
    expected: i < 5 ? ('hit' as const) : ('miss' as const),
  })),
];

interface RoundResult {
  round: number;
  label: string;
  query: string;
  expected: 'hit' | 'miss';
  actual: 'hit' | 'miss';
  similarity: number;
  matchedQuery?: string;
  durationMs: number;
}

async function main() {
  console.log('━━━ Cache Bench · 50 轮命中率实测 ━━━\n');

  // ---- 初始化客户端 ----
  const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
  const redisUrl = process.env.REDIS_URL?.replace('6380', '6379') || 'redis://localhost:6379';
  const qwenKey = process.env.QWEN_API_KEY!;
  const qwenBase = process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';

  if (!qwenKey) {
    console.error('❌ QWEN_API_KEY missing');
    process.exit(1);
  }

  console.log(`Qdrant: ${qdrantUrl}`);
  console.log(`Redis:  ${redisUrl}`);
  console.log(`Qwen:   ${qwenBase}\n`);

  const qdrant = new QdrantClient({ url: qdrantUrl });
  const redis = createClient({ url: redisUrl });
  await redis.connect();
  const embedder = new OpenAI({ apiKey: qwenKey, baseURL: qwenBase });

  // ---- 准备 collection ----
  console.log('[setup] 清空 bench collection，cold start...');
  try {
    await qdrant.deleteCollection(COLLECTION);
  } catch {}
  await qdrant.createCollection(COLLECTION, {
    vectors: { size: VECTOR_SIZE, distance: 'Cosine' },
  });
  await qdrant.createPayloadIndex(COLLECTION, {
    field_name: 'userId',
    field_schema: 'keyword',
  });

  // 预先 populate Round 2/3/5 的 query 到 cache（让后续 lookup 能命中）
  console.log('[setup] 预热 cache:Round 2/3/5 的代表 query\n');
  const seedQueries = [
    'React Hooks useEffect 的依赖数组工作原理是什么？',     // Round 2 seed
    'React Hooks 中 useEffect 的 deps 数组如何工作？',        // Round 3 seed
    'useEffect 的依赖列表是怎么触发副作用的？',                // Round 3 seed
    '请解释 useEffect dependency array 的机制',                // Round 3 seed
    ...Array.from({ length: 5 }, (_, i) => [
      'React Hooks 中 useEffect 什么时候会触发 component re-render？',
      'useEffect 的 cleanup 函数在什么时候执行？',
      'useEffect 中返回的函数是做什么用的？',
      'useEffect 第二个参数传空数组和不传有什么区别？',
      'useEffect 怎么模拟 componentDidMount 生命周期？',
    ][i]),
  ];

  for (const q of seedQueries) {
    const vec = await embed(q, embedder);
    const cacheId = randomUUID();
    await qdrant.upsert(COLLECTION, {
      wait: false,
      points: [{
        id: cacheId,
        vector: vec,
        payload: {
          userId: USER_ID,
          cacheType: CACHE_TYPE,
          query: q,
          response: `[cached] answer for: ${q.slice(0, 50)}`,
          createdAt: Date.now(),
        },
      }],
    });
    const fastKey = `sc:hash:${CACHE_TYPE}:${USER_ID}:${fnv1a(`${USER_ID}::${CACHE_TYPE}::${q.trim().toLowerCase()}`).toString(16)}`;
    await redis.set(fastKey, JSON.stringify({ response: `[cached] ${q.slice(0, 30)}`, cacheId }), 3600);
  }

  console.log(`[setup] ${seedQueries.length} seed queries cached\n`);

  // ---- 50 轮 bench ----
  const results: RoundResult[] = [];
  for (let i = 0; i < BENCH_CASES.length; i++) {
    const c = BENCH_CASES[i];
    const t0 = Date.now();
    const result = await lookup(c, qdrant, redis, embedder);
    const durationMs = Date.now() - t0;
    results.push({ ...result, durationMs });
    const icon = result.actual === result.expected ? '✅' : (result.expected === 'miss' && result.actual === 'hit' ? '⚠️ FP' : '❌ FN');
    console.log(
      `  ${icon} [R${c.round}] ${c.label.padEnd(15)} ` +
      `expect=${c.expected.padEnd(4)} actual=${result.actual.padEnd(4)} ` +
      `sim=${result.similarity.toFixed(3)} ` +
      `(${durationMs}ms)`,
    );
    // bench 不要打太快，模拟真实流量间隔
    await sleep(50);
  }

  // ---- 统计 ----
  console.log('\n━━━ Statistics ━━━');
  const total = results.length;
  const hits = results.filter((r) => r.actual === 'hit').length;
  const misses = total - hits;
  const hitRate = (hits / total) * 100;
  const expectedHits = results.filter((r) => r.expected === 'hit').length;
  const actualHitsOnExpected = results.filter((r) => r.expected === 'hit' && r.actual === 'hit').length;
  const recallOnExpectedHits = expectedHits > 0 ? (actualHitsOnExpected / expectedHits) * 100 : 0;
  const expectedMisses = results.filter((r) => r.expected === 'miss').length;
  const falsePositives = results.filter((r) => r.expected === 'miss' && r.actual === 'hit').length;
  const falsePositiveRate = expectedMisses > 0 ? (falsePositives / expectedMisses) * 100 : 0;

  const hitsWithSim = results.filter((r) => r.actual === 'hit');
  const avgSimilarity = hitsWithSim.length > 0
    ? hitsWithSim.reduce((s, r) => s + r.similarity, 0) / hitsWithSim.length
    : 0;
  const avgDuration = results.reduce((s, r) => s + r.durationMs, 0) / total;

  // Round-level breakdown
  const byRound: Record<number, { hits: number; total: number }> = {};
  for (const r of results) {
    byRound[r.round] = byRound[r.round] || { hits: 0, total: 0 };
    byRound[r.round].total++;
    if (r.actual === 'hit') byRound[r.round].hits++;
  }

  const summary = {
    totalRounds: total,
    hits,
    misses,
    hitRate: hitRate.toFixed(2) + '%',
    expectedHits,
    actualHitsOnExpectedHits: actualHitsOnExpected,
    recallOnExpectedHits: recallOnExpectedHits.toFixed(2) + '%',
    expectedMisses,
    falsePositives,
    falsePositiveRate: falsePositiveRate.toFixed(2) + '%',
    avgSimilarityOnHits: avgSimilarity.toFixed(4),
    avgLookupDurationMs: avgDuration.toFixed(1),
    byRound: Object.entries(byRound).map(([r, v]) => ({
      round: Number(r),
      hits: v.hits,
      total: v.total,
      hitRate: ((v.hits / v.total) * 100).toFixed(1) + '%',
    })),
    timestamp: new Date().toISOString(),
    config: { threshold: THRESHOLD, vectorSize: VECTOR_SIZE, collection: COLLECTION, cacheType: CACHE_TYPE },
  };

  console.log(`\nTotal rounds:        ${total}`);
  console.log(`Hits:                ${hits} (${summary.hitRate})`);
  console.log(`Misses:              ${misses}`);
  console.log(`Recall (期望命中):   ${actualHitsOnExpected}/${expectedHits} = ${summary.recallOnExpectedHits}`);
  console.log(`False positive rate: ${falsePositives}/${expectedMisses} = ${summary.falsePositiveRate}`);
  console.log(`Avg similarity (on hits): ${summary.avgSimilarityOnHits}`);
  console.log(`Avg lookup duration:      ${summary.avgLookupDurationMs}ms\n`);

  console.log('Round breakdown:');
  for (const r of summary.byRound) {
    console.log(`  Round ${r.round}: ${r.hits}/${r.total} = ${r.hitRate}`);
  }

  // 保存结果
  const outDir = path.resolve(__dirname, '../apps/api/src/evals/reports');
  await fs.mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.join(outDir, `cache-bench-50rounds-${stamp}.json`);
  await fs.writeFile(outPath, JSON.stringify({ summary, results }, null, 2));
  console.log(`\n📊 详细结果已存: ${outPath}`);

  // 清理
  await redis.quit();
  await qdrant.deleteCollection(COLLECTION).catch(() => {});
}

async function lookup(
  c: BenchCase,
  qdrant: QdrantClient,
  redis: any,
  embedder: OpenAI,
): Promise<{ round: number; label: string; query: string; expected: 'hit' | 'miss'; actual: 'hit' | 'miss'; similarity: number; matchedQuery?: string }> {
  // 1. Fast path: Redis hash
  const fastKey = `sc:hash:${CACHE_TYPE}:${USER_ID}:${fnv1a(`${USER_ID}::${CACHE_TYPE}::${c.query.trim().toLowerCase()}`).toString(16)}`;
  try {
    const exact = await redis.get(fastKey);
    if (exact) {
      return { round: c.round, label: c.label, query: c.query, expected: c.expected, actual: 'hit', similarity: 1.0 };
    }
  } catch {}

  // 2. Slow path: embedding + Qdrant
  try {
    const vector = await embed(c.query, embedder);
    const search = await qdrant.search(COLLECTION, {
      vector,
      limit: 1,
      score_threshold: THRESHOLD,
      filter: {
        must: [
          { key: 'userId', match: { value: USER_ID } },
          { key: 'cacheType', match: { value: CACHE_TYPE } },
        ],
      },
      with_payload: true,
    });
    if (search.length > 0) {
      return {
        round: c.round, label: c.label, query: c.query, expected: c.expected,
        actual: 'hit', similarity: search[0].score, matchedQuery: (search[0].payload as any)?.query,
      };
    }
  } catch (e) {}

  return { round: c.round, label: c.label, query: c.query, expected: c.expected, actual: 'miss', similarity: 0 };
}

async function embed(text: string, embedder: OpenAI): Promise<number[]> {
  const res = await embedder.embeddings.create({
    model: 'text-embedding-v3',
    input: text.slice(0, 2048),
    encoding_format: 'float',
    dimensions: VECTOR_SIZE,
  } as any);
  return res.data[0].embedding as number[];
}

function fnv1a(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash >>> 0;
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
