/**
 * P0 缓存工程 e2e benchmark
 *
 * 目标：50 轮 interview 对话，验证：
 *  1. 总 token 从 ~80K 降到 ≤ 35K（↓ 55%）
 *  2. Prompt Cache 命中率 ≥ 65%
 *  3. 语义缓存命中率 ≥ 20%（白名单：interview_question）
 *  4. 重试率 < 5%
 *  5. GET /api/session/:id/cost 1s 内返回
 *
 * 运行：
 *   1. 启动 API：pnpm dev
 *   2. 另开终端：node --import tsx scripts/bench-p0.ts
 *
 * 注：本脚本需要 API 真实运行，所以 mock 模式下不跑
 */

import { performance } from 'perf_hooks';

const API_BASE = process.env.API_BASE || 'http://localhost:3001';
const INTERVIEW_ID = process.env.INTERVIEW_ID || 'bench-' + Date.now();
const USER_ID = process.env.USER_ID || 'bench-user';
const POSITION = process.env.POSITION || '前端开发';
const LEVEL = 'P6';
const ROUNDS = 50;

interface BenchResult {
  totalTokens: number;
  promptCacheHits: number;
  promptCacheMisses: number;
  semanticCacheHits: number;
  semanticCacheMisses: number;
  retries: number;
  llmCalls: number;
  durationMs: number;
  costPanelResponseMs: number;
}

async function callChat(sessionId: string, userInput: string): Promise<{ content: string; usage: any }> {
  const res = await fetch(`${API_BASE}/api/interview/${sessionId}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: USER_ID, message: userInput }),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function getCostPanel(sessionId: string): Promise<{ data: BenchResult; responseMs: number }> {
  const start = performance.now();
  const res = await fetch(`${API_BASE}/api/session/${sessionId}/cost`);
  const ms = performance.now() - start;
  if (!res.ok) throw new Error(`cost API ${res.status}`);
  return { data: await res.json(), responseMs: ms };
}

// 50 轮典型面试题（部分重复触发语义缓存）
const QUESTIONS = [
  '请自我介绍',
  '你做过最复杂的项目是什么',
  'React 的虚拟 DOM 原理',
  '如何优化首屏加载',
  '闭包是什么',
  '事件循环',
  // 重复 4 轮触发语义缓存
  '请自我介绍',
  '你做过最复杂的项目是什么',
  'React 的虚拟 DOM 原理',
  '如何优化首屏加载',
];

function pickQuestion(round: number): string {
  return QUESTIONS[round % QUESTIONS.length];
}

async function main() {
  console.log(`🚀 P0 缓存 benchmark - ${ROUNDS} 轮`);
  console.log(`   API: ${API_BASE}`);
  console.log(`   session: ${INTERVIEW_ID}\n`);

  const start = performance.now();
  const usage = { promptTokens: 0, completionTokens: 0 };

  // 创建 session
  const createRes = await fetch(`${API_BASE}/api/interview/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: USER_ID, position: POSITION, level: LEVEL }),
  });
  if (!createRes.ok) throw new Error(`create interview ${createRes.status}`);
  const { id: sessionId } = await createRes.json();
  console.log(`📝 session created: ${sessionId}\n`);

  for (let round = 0; round < ROUNDS; round++) {
    const q = pickQuestion(round);
    const t0 = performance.now();
    try {
      const r = await callChat(sessionId, q);
      const dt = performance.now() - t0;
      if (r.usage) {
        usage.promptTokens += r.usage.promptTokens || 0;
        usage.completionTokens += r.usage.completionTokens || 0;
      }
      if (round % 10 === 0) console.log(`   [round ${round}] ${dt.toFixed(0)}ms - "${q.slice(0, 20)}..."`);
    } catch (e: any) {
      console.error(`   [round ${round}] FAIL: ${e.message}`);
    }
  }

  // 触发 session.end
  await fetch(`${API_BASE}/api/interview/${sessionId}/end`, { method: 'POST' });

  const totalElapsed = performance.now() - start;

  // 拉 cost 面板
  const panel = await getCostPanel(sessionId);
  const p = panel.data;
  const totalTokens = usage.promptTokens + usage.completionTokens;
  const tokenSaved = 80000 - totalTokens; // 假设基线 80K

  console.log('\n=== Benchmark Results ===');
  console.log(`  ⏱  total wall:        ${(totalElapsed / 1000).toFixed(1)}s`);
  console.log(`  📊 total tokens:      ${totalTokens.toLocaleString()}`);
  console.log(`  💾 token saved:       ~${tokenSaved.toLocaleString()} (${((tokenSaved / 80000) * 100).toFixed(1)}%)`);
  console.log(`  📞 llm calls:         ${p.llmCalls}`);
  console.log(`  🎯 prompt cache hit:  ${p.promptCacheHits}/${p.promptCacheHits + p.promptCacheMisses} = ${(p.promptCacheHitRate * 100).toFixed(1)}%`);
  console.log(`  🎯 semantic cache:    ${p.semanticCacheHits}/${p.semanticCacheHits + p.semanticCacheMisses} = ${(p.semanticCacheHitRate * 100).toFixed(1)}%`);
  console.log(`  🔁 retry rate:        ${(p.retryRate * 100).toFixed(1)}%`);
  console.log(`  💰 cost:              ¥${p.estimatedCostCny.toFixed(4)}`);
  console.log(`  ⚡ cost panel:        ${panel.responseMs.toFixed(0)}ms`);

  // 验收
  const checks = [
    { name: 'Token 节省 ≥ 55%', pass: tokenSaved / 80000 >= 0.55 },
    { name: 'Prompt Cache 命中率 ≥ 65%', pass: p.promptCacheHitRate >= 0.65 },
    { name: '语义缓存命中率 ≥ 20%', pass: p.semanticCacheHitRate >= 0.20 },
    { name: '重试率 < 5%', pass: p.retryRate < 0.05 },
    { name: 'cost panel 1s 内返回', pass: panel.responseMs < 1000 },
  ];

  console.log('\n=== Acceptance ===');
  checks.forEach((c) => console.log(`  ${c.pass ? '✅' : '❌'} ${c.name}`));
  const allPass = checks.every((c) => c.pass);
  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(2);
});
