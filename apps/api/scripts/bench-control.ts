/**
 * 对照组 benchmark · 50 轮真实 LLM
 *
 * 绕过项目所有优化层（multi-agent / cache / context compression / fallback）,
 * 直接调 Qwen dashscope OpenAI 兼容 API, 量化"无优化基线 token 数"。
 *
 * 对比实验组 (bench-p0.ts) 当前 token = 869, 算出真实节省百分比。
 *
 * 运行:
 *   node --import tsx scripts/bench-control.ts
 */

import { performance } from 'perf_hooks';
import * as fs from 'fs';
import * as path from 'path';

// 从仓库根 .env 加载（path: __dirname/.. → apps/api/scripts → ../.. → apps/api → ../../.. → 仓库根）
function loadEnv(): Record<string, string> {
  const candidates = [
    path.join(__dirname, '..', '..', '..', '.env'),       // 仓库根
    path.join(process.cwd(), '.env'),                       // 当前工作目录
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, 'utf-8');
      const env: Record<string, string> = {};
      for (const line of content.split('\n')) {
        const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (m) env[m[1]] = m[2];
      }
      return env;
    }
  }
  return {};
}

const env = loadEnv();
const API_KEY = env.QWEN_API_KEY || process.env.QWEN_API_KEY;
const BASE_URL = env.QWEN_BASE_URL || process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const MODEL = env.QWEN_MODEL || process.env.QWEN_MODEL || 'qwen-plus';

const ROUNDS = 50;

// 模拟项目里真实使用的 system prompt（精简版, 不带 tool / few-shot）
// 等价于"multi-agent 主路径里传给的 system prompt 基础"
const SYSTEM_PROMPT = `你是一位专业的 AI 面试官，正在对候选人的技术能力进行多轮结构化评估。
- 提问要具体、有深度
- 根据候选人回答追问
- 保持简洁友好的语气`;

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatResponse {
  choices: Array<{
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

const QUESTIONS = [
  '请自我介绍',
  '你做过最复杂的项目是什么',
  'React 的虚拟 DOM 原理',
  '如何优化首屏加载',
  '闭包是什么',
  '事件循环',
];

async function callQwen(messages: Message[]): Promise<{ content: string; usage: ChatResponse['usage'] }> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.7,
      max_tokens: 500,
    }),
  });
  if (!res.ok) {
    throw new Error(`Qwen API ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as ChatResponse;
  return {
    content: data.choices[0]?.message?.content || '',
    usage: data.usage,
  };
}

async function main() {
  console.log(`🧪 Control Group Benchmark · ${ROUNDS} 轮 · 无任何优化`);
  console.log(`   API: ${BASE_URL} · model: ${MODEL}\n`);

  const start = performance.now();
  const totalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  const history: Message[] = [{ role: 'system', content: SYSTEM_PROMPT }];

  for (let round = 0; round < ROUNDS; round++) {
    const question = QUESTIONS[round % QUESTIONS.length];
    const t0 = performance.now();
    try {
      // 关键：对照组每次都带完整 history（不压缩、不复用、不 cache）
      history.push({ role: 'user', content: question });
      const { content, usage } = await callQwen(history);
      history.push({ role: 'assistant', content });
      totalUsage.promptTokens += usage.prompt_tokens;
      totalUsage.completionTokens += usage.completion_tokens;
      totalUsage.totalTokens += usage.total_tokens;
      const dt = performance.now() - t0;
      if (round % 10 === 0) {
        console.log(`   [round ${round}] ${dt.toFixed(0)}ms · prompt=${usage.prompt_tokens} completion=${usage.completion_tokens}`);
      }
    } catch (e: any) {
      console.error(`   [round ${round}] FAIL: ${e.message}`);
    }
  }

  const elapsed = performance.now() - start;
  const costCny = (totalUsage.promptTokens / 1000) * 0.004 + (totalUsage.completionTokens / 1000) * 0.012;

  console.log(`\n=== Control Group Results ===`);
  console.log(`  ⏱  total wall:        ${(elapsed / 1000).toFixed(1)}s`);
  console.log(`  📊 total tokens:      ${totalUsage.totalTokens.toLocaleString()}`);
  console.log(`     prompt tokens:     ${totalUsage.promptTokens.toLocaleString()}`);
  console.log(`     completion tokens: ${totalUsage.completionTokens.toLocaleString()}`);
  console.log(`  💰 cost (Qwen 单价):  ¥${costCny.toFixed(4)}`);
  console.log(`  📞 llm calls:         ${ROUNDS}`);

  // 对比实验组
  const expTotal = 869;
  const expCost = 0.0053;
  const tokenSaved = totalUsage.totalTokens - expTotal;
  const pctSaved = totalUsage.totalTokens > 0 ? (tokenSaved / totalUsage.totalTokens) * 100 : 0;
  const costSaved = costCny - expCost;

  console.log(`\n=== 对比实验组 (bench-p0.ts v3) ===`);
  console.log(`  📉 token 下降:    ${expTotal} / ${totalUsage.totalTokens.toLocaleString()} = ↓${pctSaved.toFixed(2)}%`);
  console.log(`  💰 cost 下降:     ¥${expCost.toFixed(4)} / ¥${costCny.toFixed(4)} = ↓${costSaved > 0 ? ((costSaved / costCny) * 100).toFixed(2) : '0'}%`);
  console.log(`  ⏱  wall 对比:    实验组 552.6s · 对照组 ${(elapsed / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error('Control benchmark failed:', err);
  process.exit(2);
});