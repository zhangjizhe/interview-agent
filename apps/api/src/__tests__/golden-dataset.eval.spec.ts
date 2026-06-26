/**
 * Golden Dataset Eval — Vitest 集成
 *
 * 跑一次完整 eval,断言 4 个核心指标达标。
 * CI 集成:本测试通过 = 可以发版;不通过 = 阻断 merge。
 *
 * 运行:
 *   pnpm vitest run src/evals/golden-dataset.eval.spec.ts
 *
 * 注意:这个测试会调真实 LLM,需要 .env 配置好 QWEN_API_KEY。
 *       慢测试(30 case × 2-4 档 = 60-120 次 LLM 调用,约 3-8 分钟)。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { AppModule } from '../app.module';
import { LlmGatewayService } from '../modules/llm/llm.gateway.service';
import { EvalRunner } from './eval-runner';
import { EvalReporter } from './eval-reporter';
import * as path from 'path';
import * as fs from 'fs';

const DATASET_PATH = path.join(__dirname, 'golden-dataset.json');
const OUTPUT_DIR = path.join(__dirname, 'reports');
const DATASET_VERSION = '1.0.0';

// CI 阈值 — 比 baseline 报告里的数值高 5% 作为"质量门"
const CI_THRESHOLDS = {
  pearson: 0.65,    // 相关性 ≥ 0.65
  mae: 25,          // MAE ≤ 25
  levelAcc: 0.6,    // 档位一致率 ≥ 60%
  keywordHit: 0.45, // 关键词命中率 ≥ 45%
  sampleSize: 30,   // 至少 30 条样本
};

describe('Golden Dataset Eval (Regression)', () => {
  let report: Awaited<ReturnType<EvalRunner['run']>>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const llm = moduleRef.get(LlmGatewayService);

    const reporter = new EvalReporter(OUTPUT_DIR);
    const runner = new EvalRunner(
      llm,
      { datasetPath: DATASET_PATH, outputDir: OUTPUT_DIR, concurrency: 1, model: 'qwen' },
      reporter,
    );

    report = await runner.run();
    await moduleRef.close();
  }, 600_000); // 10 分钟 timeout (30 case × ~15s = 450s)

  it('数据集完整性', () => {
    expect(fs.existsSync(DATASET_PATH)).toBe(true);
    expect(report.metadata.datasetVersion).toBe(DATASET_VERSION);
  });

  it(`样本数 ≥ ${CI_THRESHOLDS.sampleSize}`, () => {
    expect(report.overall.sampleSize).toBeGreaterThanOrEqual(CI_THRESHOLDS.sampleSize);
  });

  it(`分数相关性 ≥ ${CI_THRESHOLDS.pearson}`, () => {
    expect(report.overall.scorePearson).toBeGreaterThanOrEqual(CI_THRESHOLDS.pearson);
  });

  it(`平均绝对偏差 ≤ ${CI_THRESHOLDS.mae}`, () => {
    expect(report.overall.scoreMAE).toBeLessThanOrEqual(CI_THRESHOLDS.mae);
  });

  it(`档位一致率 ≥ ${CI_THRESHOLDS.levelAcc * 100}%`, () => {
    expect(report.overall.levelAccuracy).toBeGreaterThanOrEqual(CI_THRESHOLDS.levelAcc);
  });

  it(`关键词命中率 ≥ ${CI_THRESHOLDS.keywordHit * 100}%`, () => {
    expect(report.overall.keywordHitRate).toBeGreaterThanOrEqual(CI_THRESHOLDS.keywordHit);
  });

  it('没有 LLM 调用错误', () => {
    const errorCount = report.caseResults
      .flatMap((c) => c.responses)
      .filter((r) => r.error).length;
    expect(errorCount).toBe(0);
  });
});
