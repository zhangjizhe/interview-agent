/**
 * Current default-path benchmark:
 * - Control: direct Qwen calls with full accumulated history.
 * - Experiment: authenticated NestJS multi-agent SSE workflow.
 *
 * Requires a running Docker stack and valid Qwen credentials in .env.
 * Writes a machine-readable result without printing credentials or model output.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..', '..');
const api = process.env.API_URL || 'http://localhost:3001';
const rounds = Number.parseInt(process.env.BENCH_ROUNDS || '10', 10);
const password = 'benchmark-password-123';
const startedAt = new Date();
const stamp = startedAt.toISOString().replace(/[:.]/g, '-');
const outputDir = join(__dirname, 'screenshots', 'acceptance-2026-08-12', 'benchmarks');

if (!Number.isInteger(rounds) || rounds < 2 || rounds > 50) {
  throw new Error('BENCH_ROUNDS must be an integer from 2 to 50');
}

function readEnv() {
  const raw = readFileSync(join(root, '.env'), 'utf8');
  return Object.fromEntries(
    raw.split('\n')
      .map((line) => line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/))
      .filter(Boolean)
      .map((match) => [match[1], match[2]]),
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(path, options = {}) {
  const response = await fetch(`${api}${path}`, options);
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 300) }; }
  if (!response.ok) {
    throw new Error(`${path} HTTP ${response.status}: ${body.message || body.raw || 'unknown error'}`);
  }
  return body;
}

async function streamInterview(path, token, content) {
  const started = performance.now();
  const response = await fetch(`${api}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content }),
  });
  if (!response.ok || !response.body) {
    throw new Error(`${path} HTTP ${response.status}: ${await response.text()}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let firstEventMs = null;
  let serverErrors = [];
  let done = false;

  while (!done) {
    const chunk = await reader.read();
    done = chunk.done;
    if (!chunk.value) continue;
    buffer += decoder.decode(chunk.value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';
    for (const event of events) {
      for (const line of event.split('\n')) {
        if (!line.startsWith('data:')) continue;
        if (firstEventMs === null) firstEventMs = performance.now() - started;
        const value = line.slice(5).trim();
        if (!value || value === '[DONE]') continue;
        try {
          const parsed = JSON.parse(value);
          if (parsed.type === 'error') serverErrors.push(parsed.error || 'unknown SSE error');
        } catch {
          // SSE comments are not part of the benchmark result.
        }
      }
    }
  }

  assert(serverErrors.length === 0, `SSE returned errors: ${serverErrors.join('; ')}`);
  return { firstEventMs, durationMs: performance.now() - started };
}

async function runControl(env, questions) {
  const baseUrl = env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
  const model = env.QWEN_MODEL || 'qwen-plus';
  const apiKey = env.QWEN_API_KEY;
  assert(apiKey && !apiKey.includes('your_qwen_api_key_here'), 'QWEN_API_KEY is not configured');

  const history = [{
    role: 'system',
    content: 'You are a technical interviewer. Give concise, accurate interview feedback and one follow-up question.',
  }];
  const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  const durations = [];

  for (const question of questions) {
    const started = performance.now();
    history.push({ role: 'user', content: question });
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: history, temperature: 0, max_tokens: 250 }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(`control Qwen call HTTP ${response.status}`);
    const content = body.choices?.[0]?.message?.content || '';
    history.push({ role: 'assistant', content });
    usage.promptTokens += body.usage?.prompt_tokens || 0;
    usage.completionTokens += body.usage?.completion_tokens || 0;
    usage.totalTokens += body.usage?.total_tokens || 0;
    durations.push(performance.now() - started);
  }

  return {
    provider: 'qwen',
    model,
    calls: questions.length,
    usage,
    wallMs: durations.reduce((sum, duration) => sum + duration, 0),
  };
}

const env = readEnv();
const health = await request('/api/health');
assert(health.status === 'ok', 'API health check did not return ok');

const userId = `benchmark-${Date.now()}`;
const register = await request('/api/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId, password }),
});
assert(register.role === 'USER', 'benchmark account is not a USER');

const login = await request('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId, password }),
});
const token = login.accessToken;

const resumeForm = new FormData();
resumeForm.append(
  'file',
  new Blob([readFileSync(join(root, 'apps/api/tests/fixtures/acceptance-resume.md'))], { type: 'text/markdown' }),
  'benchmark-resume.md',
);
resumeForm.append('position', 'AI Agent Engineer');
const uploadedResume = await request('/api/interview/upload-resume', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: resumeForm,
});
assert(uploadedResume.ragIngested === true, 'resume was not ingested into RAG');

const startedInterview = await request('/api/interview/start', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ position: 'AI Agent Engineer', level: 'P5' }),
});
const interviewId = startedInterview.interviewId;
await request(`/api/interview/${interviewId}/confirm-resume`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
});

const promptSet = [
  'Explain how you would separate agent planning, execution, and evaluation in a production interview workflow.',
  'How would you make a vector-backed question bank immediately consistent after an import?',
  'What controls would you add to prevent a user from reading another candidate interview?',
  'How would you design provider fallback without silently hiding permanent billing or credential errors?',
  'Explain how you would observe token cost and cache effectiveness for a streamed interview.',
];
const questions = Array.from({ length: rounds }, (_, index) => promptSet[index % promptSet.length]);

const control = await runControl(env, questions);
const agentRounds = [];
for (const [index, content] of questions.entries()) {
  const result = await streamInterview(`/api/interview/${interviewId}/message`, token, content);
  agentRounds.push({ round: index + 1, ...result });
}

const costPanelStarted = performance.now();
const cost = await request(`/api/session/${interviewId}/cost`, {
  headers: { Authorization: `Bearer ${token}` },
});
const costPanelMs = performance.now() - costPanelStarted;
assert(cost.llmCalls > 0, 'cost panel did not record LLM calls');

const experimentTokens = cost.totalTokens;
const tokenSavings = control.usage.totalTokens - experimentTokens;
const tokenSavingsPct = control.usage.totalTokens > 0
  ? (tokenSavings / control.usage.totalTokens) * 100
  : 0;
const promptCacheTotal = cost.promptCacheHits + cost.promptCacheMisses;
const semanticCacheTotal = cost.semanticCacheHits + cost.semanticCacheMisses;

const result = {
  benchmark: 'current-default-nestjs-multi-agent-cache',
  generatedAt: new Date().toISOString(),
  api,
  rounds,
  environment: {
    apiHealth: health.status,
    defaultPath: 'NestJS + JWT-authenticated SSE',
    experimentalPath: 'LangGraph multi-agent workflow via /api/interview/:id/message',
  },
  control,
  experiment: {
    interviewId,
    cost: {
      totalTokens: experimentTokens,
      llmCalls: cost.llmCalls,
      promptCacheHits: cost.promptCacheHits,
      promptCacheMisses: cost.promptCacheMisses,
      semanticCacheHits: cost.semanticCacheHits,
      semanticCacheMisses: cost.semanticCacheMisses,
      cacheSavedTokens: cost.cacheSavedTokens,
      retryRate: cost.retryRate,
      fallbackRate: cost.fallbackRate,
      estimatedCostCny: cost.estimatedCostCny,
    },
    firstEventMedianMs: [...agentRounds]
      .map((round) => round.firstEventMs)
      .filter((value) => value !== null)
      .sort((a, b) => a - b)[Math.floor(agentRounds.length / 2)] || null,
    totalWallMs: agentRounds.reduce((sum, round) => sum + round.durationMs, 0),
    costPanelMs,
  },
  comparison: {
    tokenSavings,
    tokenSavingsPct,
    promptCacheHitRate: promptCacheTotal > 0 ? cost.promptCacheHits / promptCacheTotal : 0,
    semanticCacheHitRate: semanticCacheTotal > 0 ? cost.semanticCacheHits / semanticCacheTotal : 0,
  },
};

mkdirSync(outputDir, { recursive: true });
const outputPath = join(outputDir, `multi-agent-cache-${stamp}.json`);
writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({
  outputPath,
  rounds,
  controlTokens: control.usage.totalTokens,
  experimentTokens,
  tokenSavingsPct: Number(tokenSavingsPct.toFixed(2)),
  llmCalls: cost.llmCalls,
}, null, 2));
