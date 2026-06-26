/**
 * Eval Runner — 跑模型评估 Golden Dataset
 *
 * 用法:
 *   pnpm ts-node src/evals/eval-runner.ts                    # 跑全量,输出 baseline
 *   pnpm ts-node src/evals/eval-runner.ts --case case-001    # 跑单条
 *   pnpm ts-node src/evals/eval-runner.ts --validate         # 只校验数据集格式
 *
 * 输出:
 *   apps/api/src/evals/reports/eval-report-YYYY-MM-DD-HHMM.json
 *   apps/api/src/evals/reports/eval-report-YYYY-MM-DD-HHMM.md
 */
import { Logger } from '@nestjs/common';
import { LlmGatewayService } from '../modules/llm/llm.gateway.service';
import { loadGoldenDataset, type GoldenCase, type GoldenResponse } from './golden-dataset.schema';
import { EvalReporter, type CaseResult, type EvalReport } from './eval-reporter';

const logger = new Logger('EvalRunner');

interface RunnerConfig {
  datasetPath: string;
  outputDir: string;
  caseFilter?: string;
  concurrency: number;
  model: 'qwen' | 'deepseek';
}

/**
 * 让 LLM 评分单个回答
 * Prompt 显式输出 JSON 字段,便于解析
 */
const SCORING_PROMPT = `你是一位严格的面试评估专家。请基于候选人回答,给出 0-100 分及多维度评分。

【评估维度】
1. correctness (0-1): 回答是否正确、关键概念是否到位
2. depth (0-1): 是否有深度(技术细节、原理、对比、例子)
3. completeness (0-1): 是否覆盖核心要点(不要求全覆盖,主要要点不丢)
4. score (0-100): 加权总分,公式 = round((correctness * 0.4 + depth * 0.3 + completeness * 0.3) * 100)
5. feedbackKeywords (string[]): 回答中体现的关键技术词(2-5 个)
6. feedback (string): 1-2 句反馈,指出最强点和最弱改进点

【评分参考】
- 80-100: 核心要点全覆盖,深度足,有例子/对比
- 60-79: 主要要点覆盖,部分深度欠缺
- 40-59: 部分要点覆盖,缺乏深度或例子
- 0-39: 答非所问/概念错误/过于简略

【题面】
{question}

【候选人回答】
{answer}

【输出要求】严格 JSON,只输出一个 JSON object,无其他文字:
{
  "correctness": <0-1>,
  "depth": <0-1>,
  "completeness": <0-1>,
  "score": <0-100>,
  "feedbackKeywords": ["关键词1", "关键词2"],
  "feedback": "一句话反馈"
}`;

interface LlmScore {
  correctness: number;
  depth: number;
  completeness: number;
  score: number;
  feedbackKeywords: string[];
  feedback: string;
}

export class EvalRunner {
  constructor(
    private llm: LlmGatewayService,
    private config: RunnerConfig,
    private reporter: EvalReporter = new EvalReporter(config.outputDir),
  ) {}

  async run(): Promise<EvalReport> {
    logger.log(`📊 Loading dataset from ${this.config.datasetPath}`);
    const dataset = loadGoldenDataset(this.config.datasetPath);
    const cases = this.config.caseFilter
      ? dataset.cases.filter((c) => c.id === this.config.caseFilter)
      : dataset.cases;

    logger.log(`✅ Loaded ${cases.length} cases (dataset version: ${dataset.version})`);

    const results: CaseResult[] = [];
    const startTime = Date.now();

    // 简单顺序执行;并发高了会触发 LLM rate limit
    for (let i = 0; i < cases.length; i++) {
      const c = cases[i];
      logger.log(`[${i + 1}/${cases.length}] Running ${c.id} (${c.position} | ${c.difficulty})`);
      const caseResult = await this.runCase(c);
      results.push(caseResult);
      logger.log(
        `  → MAE=${caseResult.metrics.scoreMAE.toFixed(1)} | ` +
        `档位一致率=${(caseResult.metrics.levelAccuracy * 100).toFixed(0)}% | ` +
        `关键词命中率=${(caseResult.metrics.keywordHitRate * 100).toFixed(0)}%`,
      );
    }

    const report: EvalReport = this.reporter.buildReport(dataset, results, Date.now() - startTime);
    const jsonPath = await this.reporter.writeJson(report);
    const mdPath = await this.reporter.writeMarkdown(report);

    logger.log(`✅ Done. Report saved:`);
    logger.log(`   ${jsonPath}`);
    logger.log(`   ${mdPath}`);

    return report;
  }

  private async runCase(c: GoldenCase): Promise<CaseResult> {
    const responseResults: CaseResult['responses'] = [];

    for (const golden of c.responses) {
      try {
        const llmResult = await this.scoreResponse(c.question, golden.answer);
        responseResults.push(this.compareResult(golden, llmResult));
      } catch (err: any) {
        logger.error(`  ❌ LLM scoring failed for ${c.id} [${golden.level}]: ${err.message}`);
        responseResults.push({
          level: golden.level,
          expectedScore: golden.expectedScore,
          actualScore: 0,
          expectedKeywords: golden.expectedFeedbackKeywords,
          actualKeywords: [],
          expectedFeedback: golden.reason,
          actualFeedback: `LLM 调用失败: ${err.message}`,
          error: err.message,
        });
      }
    }

    return {
      caseId: c.id,
      question: c.question,
      position: c.position,
      level: c.level,
      difficulty: c.difficulty,
      responses: responseResults,
      metrics: this.calcCaseMetrics(responseResults),
    };
  }

  /**
   * 调 LLM 评分
   * 用 temperature=0 让结果更稳定(可重复)
   */
  private async scoreResponse(question: string, answer: string): Promise<LlmScore> {
    const prompt = SCORING_PROMPT
      .replace('{question}', question)
      .replace('{answer}', answer);

    const response = await this.llm.chat({
      messages: [
        { role: 'system', content: '你是严格的面试评估 AI,只输出 JSON。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0, // 评估必须稳定
      maxTokens: 800,
    });

    // 解析 JSON (scoring.service.ts 已用 safeJsonParse 思路)
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(`LLM 输出无 JSON: ${response.content.slice(0, 200)}`);
    }
    return JSON.parse(jsonMatch[0]) as LlmScore;
  }

  private compareResult(
    golden: GoldenResponse,
    llm: LlmScore,
  ): CaseResult['responses'][number] {
    return {
      level: golden.level,
      expectedScore: golden.expectedScore,
      actualScore: llm.score,
      expectedKeywords: golden.expectedFeedbackKeywords,
      actualKeywords: llm.feedbackKeywords,
      expectedFeedback: golden.reason,
      actualFeedback: llm.feedback,
      error: undefined,
    };
  }

  private calcCaseMetrics(
    responses: CaseResult['responses'],
  ): CaseResult['metrics'] {
    const successful = responses.filter((r) => !r.error);
    if (successful.length === 0) {
      return { scoreMAE: 100, levelAccuracy: 0, keywordHitRate: 0, sampleSize: 0 };
    }

    // 1. MAE: 平均绝对误差 (|actualScore - expectedScore|)
    const scoreMAE =
      successful.reduce((sum, r) => sum + Math.abs(r.actualScore - r.expectedScore), 0) /
      successful.length;

    // 2. 档位一致率: 根据分数映射到档位,看是否和 expectedLevel 一致
    //    档位映射: 0-39=poor, 40-59=average, 60-79=good, 80+=excellent
    const actualLevel = (s: number) =>
      s >= 80 ? 'excellent' : s >= 60 ? 'good' : s >= 40 ? 'average' : 'poor';
    const correctLevels = successful.filter(
      (r) => actualLevel(r.actualScore) === r.level,
    ).length;
    const levelAccuracy = correctLevels / successful.length;

    // 3. 关键词命中率: feedbackKeywords 与 expectedFeedbackKeywords 交集 / expected
    const keywordHits = successful.reduce((sum, r) => {
      const expected = new Set(r.expectedKeywords.map((k) => k.toLowerCase()));
      const matched = r.actualKeywords.filter((k) => expected.has(k.toLowerCase())).length;
      return sum + (expected.size > 0 ? matched / expected.size : 0);
    }, 0);
    const keywordHitRate = keywordHits / successful.length;

    return {
      scoreMAE,
      levelAccuracy,
      keywordHitRate,
      sampleSize: successful.length,
    };
  }
}

/**
 * CLI 入口 — 独立模式(无 NestJS DI)
 *
 * 设计原因:
 *  - eval 只调 LLM,不需要 Prisma / Redis / 业务模块
 *  - 拉起 AppModule 会撞 prisma generate 没跑、.env 没建等基础设施问题
 *  - 独立模式:pnpm ts-node 就能跑,CI 里也能跑
 *  - 缓存/降级/成本埋点对 eval 是噪音(要测的是"评分准不准",不是"生产链路稳不稳")
 *
 * 如果未来要在 NestJS 上下文跑(比如想保留成本追踪),
 * 把下面的 standaloneScorer 换成注入的 LlmGatewayService 即可。
 */
async function main() {
  const args = process.argv.slice(2);
  const caseFilter = args.includes('--case') ? args[args.indexOf('--case') + 1] : undefined;
  const validateOnly = args.includes('--validate');

  const datasetPath = `${__dirname}/golden-dataset.json`;
  const outputDir = `${__dirname}/reports`;

  if (validateOnly) {
    const dataset = loadGoldenDataset(datasetPath);
    console.log(`✅ Dataset valid. ${dataset.cases.length} cases.`);
    return;
  }

  // 1. 校验 QWEN_API_KEY 必须在环境变量里
  const apiKey = process.env.QWEN_API_KEY;
  if (!apiKey) {
    console.error('❌ QWEN_API_KEY not set. export QWEN_API_KEY=sk-xxx before running.');
    process.exit(1);
  }

  // 2. 拿一个最小 scorer 替身(实现 chat 接口,内部走直连 Qwen)
  const scorer: MinimalLlmScorer = new StandaloneQwenScorer({
    apiKey,
    model: process.env.QWEN_MODEL || 'qwen-plus',
    baseUrl: process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  });

  // 3. 把 scorer 套进 EvalRunner(用 duck typing,不强求 class)
  const runner = new EvalRunner(scorer as any, {
    datasetPath,
    outputDir,
    caseFilter,
    concurrency: 1,
    model: 'qwen',
  });

  await runner.run();
  // 不需要 close,没有 module ref
}

/* ---------- 独立 LLM scorer(只实现 eval 需要的 chat 表面) ---------- */

interface ChatMsg {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
interface MinimalChatParams {
  messages: ChatMsg[];
  temperature?: number;
  maxTokens?: number;
}
interface MinimalChatResponse {
  content: string;
}
interface MinimalLlmScorer {
  chat(params: MinimalChatParams): Promise<MinimalChatResponse>;
}

class StandaloneQwenScorer implements MinimalLlmScorer {
  constructor(
    private opts: { apiKey: string; model: string; baseUrl: string },
  ) {}

  async chat(params: MinimalChatParams): Promise<MinimalChatResponse> {
    const res = await fetch(`${this.opts.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.opts.apiKey}`,
      },
      body: JSON.stringify({
        model: this.opts.model,
        messages: params.messages,
        temperature: params.temperature ?? 0,
        max_tokens: params.maxTokens ?? 800,
        stream: false,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Qwen HTTP ${res.status}: ${errText.slice(0, 300)}`);
    }

    const data: any = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error(`Qwen 响应无 content: ${JSON.stringify(data).slice(0, 300)}`);
    }
    return { content };
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('❌ Eval failed:', err);
    process.exit(1);
  });
}
