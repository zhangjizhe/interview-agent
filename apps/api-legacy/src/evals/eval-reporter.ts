/**
 * Eval Reporter — 把 eval 结果转成 JSON + Markdown 报告
 *
 * 5 个核心指标:
 *  - scorePearson: LLM 评分 vs 期望分数的皮尔逊相关系数
 *  - scoreMAE: 平均绝对误差
 *  - levelAccuracy: 档位一致率 (excellent/good/average/poor 分类正确)
 *  - keywordHitRate: 关键词命中率
 *  - sampleSize: 总样本数
 */
import * as fs from 'fs';
import * as path from 'path';
import type { GoldenDataset } from './golden-dataset.schema';

export interface CaseResult {
  caseId: string;
  question: string;
  position: string;
  level: string;
  difficulty: string;
  responses: {
    level: string;
    expectedScore: number;
    actualScore: number;
    expectedKeywords: string[];
    actualKeywords: string[];
    expectedFeedback: string;
    actualFeedback: string;
    error?: string;
  }[];
  metrics: {
    scoreMAE: number;
    levelAccuracy: number;
    keywordHitRate: number;
    sampleSize: number;
  };
}

export interface EvalReport {
  metadata: {
    timestamp: string;
    datasetVersion: string;
    durationMs: number;
    model: string;
  };
  overall: {
    scorePearson: number;
    scoreMAE: number;
    levelAccuracy: number;
    keywordHitRate: number;
    sampleSize: number;
    passThreshold: { pearson: number; mae: number; levelAcc: number; keywordHit: number };
  };
  byDifficulty: Record<string, { scoreMAE: number; levelAccuracy: number; sampleSize: number }>;
  byPosition: Record<string, { scoreMAE: number; levelAccuracy: number; sampleSize: number }>;
  failedCases: { caseId: string; reason: string; level: string; deviation: number }[];
  caseResults: CaseResult[];
}

export class EvalReporter {
  constructor(private outputDir: string) {}

  buildReport(
    dataset: GoldenDataset,
    results: CaseResult[],
    durationMs: number,
  ): EvalReport {
    // 1. 计算整体指标
    const allPairs = results
      .flatMap((r) => r.responses)
      .filter((r) => !r.error);
    const expectedScores = allPairs.map((r) => r.expectedScore);
    const actualScores = allPairs.map((r) => r.actualScore);

    const overall = {
      scorePearson: this.pearson(expectedScores, actualScores),
      scoreMAE:
        allPairs.reduce((s, r) => s + Math.abs(r.actualScore - r.expectedScore), 0) /
        allPairs.length,
      levelAccuracy:
        allPairs.filter(
          (r) => this.scoreToLevel(r.actualScore) === r.level,
        ).length / allPairs.length,
      keywordHitRate:
        allPairs.reduce((s, r) => {
          const exp = new Set(r.expectedKeywords.map((k) => k.toLowerCase()));
          const hit = r.actualKeywords.filter((k) => exp.has(k.toLowerCase())).length;
          return s + (exp.size > 0 ? hit / exp.size : 0);
        }, 0) / allPairs.length,
      sampleSize: allPairs.length,
      passThreshold: { pearson: 0.7, mae: 20, levelAcc: 0.65, keywordHit: 0.5 },
    };

    // 2. 按难度分组
    const byDifficulty: EvalReport['byDifficulty'] = {};
    for (const diff of ['easy', 'medium', 'hard']) {
      const subset = results.filter((r) => r.difficulty === diff);
      const pairs = subset.flatMap((r) => r.responses).filter((r) => !r.error);
      if (pairs.length === 0) continue;
      byDifficulty[diff] = {
        scoreMAE:
          pairs.reduce((s, r) => s + Math.abs(r.actualScore - r.expectedScore), 0) / pairs.length,
        levelAccuracy:
          pairs.filter((r) => this.scoreToLevel(r.actualScore) === r.level).length / pairs.length,
        sampleSize: pairs.length,
      };
    }

    // 3. 按岗位分组
    const byPosition: EvalReport['byPosition'] = {};
    const posMap = new Map<string, { sumDev: number; sumLevel: number; n: number }>();
    for (const r of results) {
      const pairs = r.responses.filter((rr) => !rr.error);
      if (pairs.length === 0) continue;
      const cur = posMap.get(r.position) || { sumDev: 0, sumLevel: 0, n: 0 };
      cur.sumDev += pairs.reduce((s, p) => s + Math.abs(p.actualScore - p.expectedScore), 0);
      cur.sumLevel += pairs.filter((p) => this.scoreToLevel(p.actualScore) === p.level).length;
      cur.n += pairs.length;
      posMap.set(r.position, cur);
    }
    for (const [pos, v] of posMap) {
      byPosition[pos] = {
        scoreMAE: v.sumDev / v.n,
        levelAccuracy: v.sumLevel / v.n,
        sampleSize: v.n,
      };
    }

    // 4. 失败 case 清单 (MAE > 25 或档位错)
    const failedCases: EvalReport['failedCases'] = [];
    for (const r of results) {
      for (const p of r.responses) {
        if (p.error) {
          failedCases.push({ caseId: r.caseId, reason: 'LLM 错误', level: p.level, deviation: 0 });
          continue;
        }
        const dev = Math.abs(p.actualScore - p.expectedScore);
        const levelMatch = this.scoreToLevel(p.actualScore) === p.level;
        if (dev > 25 || !levelMatch) {
          failedCases.push({
            caseId: r.caseId,
            reason: !levelMatch ? `档位错(LLM给 ${p.actualScore} 分)` : `偏差过大`,
            level: p.level,
            deviation: dev,
          });
        }
      }
    }

    return {
      metadata: {
        timestamp: new Date().toISOString(),
        datasetVersion: dataset.version,
        durationMs,
        model: 'qwen',
      },
      overall,
      byDifficulty,
      byPosition,
      failedCases: failedCases.sort((a, b) => b.deviation - a.deviation),
      caseResults: results,
    };
  }

  async writeJson(report: EvalReport): Promise<string> {
    if (!fs.existsSync(this.outputDir)) fs.mkdirSync(this.outputDir, { recursive: true });
    const ts = report.metadata.timestamp.replace(/[:.]/g, '-');
    const filepath = path.join(this.outputDir, `eval-report-${ts}.json`);
    fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
    return filepath;
  }

  async writeMarkdown(report: EvalReport): Promise<string> {
    if (!fs.existsSync(this.outputDir)) fs.mkdirSync(this.outputDir, { recursive: true });
    const ts = report.metadata.timestamp.replace(/[:.]/g, '-');
    const filepath = path.join(this.outputDir, `eval-report-${ts}.md`);

    const o = report.overall;
    const passPearson = o.scorePearson >= o.passThreshold.pearson ? '✅' : '❌';
    const passMAE = o.scoreMAE <= o.passThreshold.mae ? '✅' : '❌';
    const passLevel = o.levelAccuracy >= o.passThreshold.levelAcc ? '✅' : '❌';
    const passKw = o.keywordHitRate >= o.passThreshold.keywordHit ? '✅' : '❌';
    const allPass = passPearson === '✅' && passMAE === '✅' && passLevel === '✅' && passKw === '✅';

    const md = `# Eval 报告 — ${report.metadata.timestamp}

## 📊 整体指标

| 指标 | 实际 | 阈值 | 通过 |
|---|---|---|---|
| 分数相关性 (Pearson) | ${o.scorePearson.toFixed(3)} | ≥ ${o.passThreshold.pearson} | ${passPearson} |
| 平均绝对偏差 (MAE) | ${o.scoreMAE.toFixed(1)} | ≤ ${o.passThreshold.mae} | ${passMAE} |
| 档位一致率 | ${(o.levelAccuracy * 100).toFixed(1)}% | ≥ ${(o.passThreshold.levelAcc * 100).toFixed(0)}% | ${passLevel} |
| 关键词命中率 | ${(o.keywordHitRate * 100).toFixed(1)}% | ≥ ${(o.passThreshold.keywordHit * 100).toFixed(0)}% | ${passKw} |

**样本数**: ${o.sampleSize} | **耗时**: ${(report.metadata.durationMs / 1000).toFixed(1)}s | **Dataset**: ${report.metadata.datasetVersion}

${allPass ? '## ✅ 全部指标达标' : '## ❌ 部分指标未达标,需要调优 prompt 或数据集'}

---

## 📈 按难度分组

| 难度 | 样本数 | MAE | 档位一致率 |
|---|---|---|---|
${Object.entries(report.byDifficulty)
  .map(([d, v]) => `| ${d} | ${v.sampleSize} | ${v.scoreMAE.toFixed(1)} | ${(v.levelAccuracy * 100).toFixed(0)}% |`)
  .join('\n')}

## 📈 按岗位分组

| 岗位 | 样本数 | MAE | 档位一致率 |
|---|---|---|---|
${Object.entries(report.byPosition)
  .map(([p, v]) => `| ${p} | ${v.sampleSize} | ${v.scoreMAE.toFixed(1)} | ${(v.levelAccuracy * 100).toFixed(0)}% |`)
  .join('\n')}

---

## ❌ 失败 Case (Top 20)

| Case | 档位 | 偏差 | 原因 |
|---|---|---|---|
${report.failedCases
  .slice(0, 20)
  .map((f) => `| ${f.caseId} | ${f.level} | ${f.deviation.toFixed(1)} | ${f.reason} |`)
  .join('\n')}

${
  report.failedCases.length > 20
    ? `\n> 还有 ${report.failedCases.length - 20} 条失败 case,详见 JSON 报告`
    : ''
}

---

## 📋 全部 Case 结果

| Case | 难度 | 档位 | 期望分 | LLM 分 | MAE | 档位 ✓ |
|---|---|---|---|---|---|---|
${report.caseResults
  .flatMap((c) =>
    c.responses.map(
      (r) =>
        `| ${c.caseId} | ${c.difficulty} | ${r.level} | ${r.expectedScore} | ${r.actualScore} | ${Math.abs(r.actualScore - r.expectedScore).toFixed(0)} | ${
          this.scoreToLevel(r.actualScore) === r.level ? '✓' : '✗'
        } |`,
    ),
  )
  .join('\n')}
`;

    fs.writeFileSync(filepath, md);
    return filepath;
  }

  /**
   * 皮尔逊相关系数
   * 衡量 LLM 评分 vs 期望分数的线性相关程度
   * 1.0 = 完美正相关, 0 = 无相关, -1 = 完美负相关
   */
  private pearson(xs: number[], ys: number[]): number {
    if (xs.length === 0 || xs.length !== ys.length) return 0;
    const n = xs.length;
    const meanX = xs.reduce((a, b) => a + b, 0) / n;
    const meanY = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0, denX = 0, denY = 0;
    for (let i = 0; i < n; i++) {
      const dx = xs[i] - meanX;
      const dy = ys[i] - meanY;
      num += dx * dy;
      denX += dx * dx;
      denY += dy * dy;
    }
    const den = Math.sqrt(denX * denY);
    return den === 0 ? 0 : num / den;
  }

  private scoreToLevel(s: number): string {
    if (s >= 80) return 'excellent';
    if (s >= 60) return 'good';
    if (s >= 40) return 'average';
    return 'poor';
  }
}
