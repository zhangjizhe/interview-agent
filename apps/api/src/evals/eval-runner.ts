/**
 * Eval Runner — 跑模型评估 Golden Dataset
 *
 * CLI: --validate performs provider-free schema validation.
 * Paid CLI execution is disabled until budget/usage evidence is enforced.
 * Trusted hosts may inject a scorer; sharing production request/parse contracts does not prove calibration.
 */
import { Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { buildInterviewDecisionMessages, parseInterviewDecision, INTERVIEW_DECISION_CONTRACT_VERSION } from '../modules/interview/services/interview-decision.contract';
import type { AgentDecision } from '../modules/interview/services/heuristic-decide.util';
import type { LlmGatewayService } from '../modules/llm/llm.gateway.service';
import { loadGoldenDataset, type GoldenCase, type GoldenResponse } from './golden-dataset.schema';
import { EvalReporter, type CaseResult, type EvalReport } from './eval-reporter';

const logger = new Logger('EvalRunner');

interface RunnerConfig {
  datasetPath: string;
  outputDir: string;
  caseFilter?: string;
  concurrency: number;
  model: string;
}

interface LlmScore extends AgentDecision {
  observedModel: string;
  observedProvider: string;
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

    if (cases.length === 0) throw new Error('GOLDEN_CASE_NOT_FOUND');
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

    const report: EvalReport = this.reporter.buildReport(dataset, results, Date.now() - startTime, {
      configuredModel: this.config.model,
      promptHash: createHash('sha256').update(JSON.stringify(buildInterviewDecisionMessages('', '', '', ''))).digest('hex'),
      scorerContractVersion: INTERVIEW_DECISION_CONTRACT_VERSION,
      expectedCaseIds: cases.map(item => item.id),
    });
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
        const llmResult = await this.scoreResponse(c, golden.answer);
        responseResults.push(this.compareResult(golden, llmResult));
      } catch (error: unknown) {
        const message = error instanceof Error && error.message.trim() ? error.message
          : typeof error === 'string' && error.trim() ? error : 'JUDGE_OR_PROVIDER_FAILURE';
        logger.error(`  ❌ LLM scoring failed for ${c.id} [${golden.level}]: ${message}`);
        responseResults.push({
          level: golden.level,
          expectedScore: golden.expectedScore,
          actualScore: 0,
          expectedKeywords: golden.expectedFeedbackKeywords,
          actualKeywords: [],
          expectedFeedback: golden.reason,
          actualFeedback: `LLM 调用失败: ${message}`,
          error: message,
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
   * 共享生产请求/解析合同；不启用启发式降级掩盖模型失败。
   */
  private async scoreResponse(question: GoldenCase, answer: string): Promise<LlmScore> {
    const response = await this.llm.chat({
      messages: buildInterviewDecisionMessages(question.question, answer, question.category, question.difficulty),
    });

    return {
      ...parseInterviewDecision(response.content),
      observedModel: typeof response.model === 'string' && response.model.trim() ? response.model : 'unknown',
      observedProvider: typeof response.provider === 'string' && response.provider.trim() ? response.provider : 'unknown',
    };
  }

  private compareResult(
    golden: GoldenResponse,
    llm: LlmScore,
  ): CaseResult['responses'][number] {
    return {
      level: golden.level,
      expectedScore: golden.expectedScore,
      actualScore: llm.score * 100,
      expectedDimensions: { correctness: golden.expectedCorrectness, depth: golden.expectedDepth, completeness: golden.expectedCompleteness },
      actualDimensions: { correctness: llm.correctness, depth: llm.depth, completeness: llm.completeness },
      expectedKeywords: golden.expectedFeedbackKeywords,
      actualKeywords: llm.keyPoints,
      expectedFeedback: golden.reason,
      actualFeedback: llm.feedback,
      observedModel: llm.observedModel,
      observedProvider: llm.observedProvider,
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

    // 3. 关键词命中率: keyPoints 与 expectedFeedbackKeywords 交集 / expected
    const keywordHits = successful.reduce((sum, r) => {
      const expected = new Set(r.expectedKeywords.map((k) => k.toLowerCase()));
      const matched = new Set(r.actualKeywords.filter((k) => expected.has(k.toLowerCase())).map(k => k.toLowerCase())).size;
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

/** CLI is deliberately provider-free until an audited budget-aware adapter exists. */
export async function runGoldenCli(args: string[], execute?: () => Promise<EvalReport>): Promise<number> {
  const known = new Set(['--validate', '--case']);
  for (let index = 0; index < args.length; index += 1) {
    if (!known.has(args[index])) throw new Error(`GOLDEN_UNKNOWN_ARGUMENT:${args[index]}`);
    if (args[index] === '--case') {
      if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error('GOLDEN_CASE_REQUIRED');
      index += 1;
    }
  }
  const dataset = loadGoldenDataset(`${__dirname}/golden-dataset.json`);
  const caseIndex = args.indexOf('--case');
  if (caseIndex >= 0 && !dataset.cases.some(item => item.id === args[caseIndex + 1])) {
    throw new Error('GOLDEN_CASE_NOT_FOUND');
  }
  if (args.includes('--validate')) {
    console.log(`Dataset valid. ${dataset.cases.length} cases; schema only, no model quality claim.`);
    return 0;
  }
  if (execute) return goldenQualityExitCode(await execute());
  throw new Error('GOLDEN_PAID_EXECUTION_DISABLED: legacy direct-provider CLI has no audited budget/usage evidence; use --validate.');
}

export function goldenQualityExitCode(report: EvalReport): number {
  return report?.qualityVerdict?.status === 'PASS' ? 0 : 1;
}

if (require.main === module) {
  runGoldenCli(process.argv.slice(2))
    .then(code => { process.exitCode = code; })
    .catch(error => {
      console.error(error instanceof Error ? error.message : 'GOLDEN_EXECUTION_FAILED');
      process.exitCode = 1;
    });
}
