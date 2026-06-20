# Golden Dataset 评估体系

> v1.0.0 · 创建于 2026-06-21

## 这是什么

**Golden Dataset** = 30 条面试评测 case,用于**回归测试** LLM 评分质量。

| 维度 | 数量 | 说明 |
|---|---|---|
| 岗位 | 15 前端 + 15 AI Agent | 跨方向 |
| 难度 | 8 easy / 14 medium / 8 hard | 真实分布 |
| 题型 | 8 概念 / 8 设计 / 6 经验 / 4 对比 / 4 边界 | 全覆盖 |
| 回答档位 | 每题 2-3 档 (excellent/poor) | 评模型稳定性 |
| **总样本** | **60+ 个评分样本** | 统计有意义 |

每条 case 包含:
- 题面
- 多档模拟回答 (excellent / good / average / poor)
- 期望分数 (expectedScore 0-100)
- 期望多维评分 (correctness / depth / completeness)
- 期望反馈关键词
- 标注 reason(为什么这个分数)

---

## 5 个核心指标

| 指标 | 含义 | 目标值 | 公式 |
|---|---|---|---|
| **scorePearson** | LLM 评分 vs 期望分数的皮尔逊相关系数 | ≥ 0.7 | 1.0 完美相关 |
| **scoreMAE** | 平均绝对误差(分) | ≤ 20 | 期望 100 给 85 = 15 |
| **levelAccuracy** | 档位一致率(excellent/good/average/poor) | ≥ 65% | 分类正确比例 |
| **keywordHitRate** | 反馈关键词命中率 | ≥ 50% | 期望关键词被覆盖比例 |
| **sampleSize** | 样本数 | ≥ 30 | 统计有效 |

---

## 使用方法

### 1. 校验数据集(无需 LLM)

```bash
cd apps/api
pnpm ts-node src/evals/eval-runner.ts --validate
```

✅ 通过 = 数据集 JSON 格式正确

### 2. 跑全量评估(需 LLM API)

```bash
cd apps/api
export QWEN_API_KEY=sk-xxx   # 必须,脚本第一件事就检查
pnpm ts-node src/evals/eval-runner.ts
```

可选环境变量:
- `QWEN_API_KEY` (必填) — DashScope API key
- `QWEN_MODEL` (默认 `qwen-plus`)
- `QWEN_BASE_URL` (默认 `https://dashscope.aliyuncs.com/compatible-mode/v1`)

⏱️ 约 5-8 分钟(30 case × 2-3 档 × ~5s LLM 调用)

> **设计说明**:CLI 入口脱离 NestJS DI,直接 fetch Qwen API。
> 原因:eval 只调 LLM,拉起 AppModule 会撞 prisma generate / .env / Redis 等基础设施问题。
> EvalRunner 类本身还兼容 LlmGatewayService(未来要在 NestJS 上下文跑,把 `StandaloneQwenScorer` 换成注入的 service 即可)。

输出:
- `apps/api/src/evals/reports/eval-report-{timestamp}.json` — 完整数据
- `apps/api/src/evals/reports/eval-report-{timestamp}.md` — Markdown 报告

### 3. 跑单条 case 调试

```bash
pnpm ts-node src/evals/eval-runner.ts --case case-001-fe-react-hooks
```

### 4. CI 集成(vitest)

```bash
pnpm vitest run src/__tests__/golden-dataset.eval.spec.ts
```

**CI 行为**: 任意指标不达标 → 测试失败 → 阻断 merge

---

## 报告示例

```markdown
# Eval 报告 — 2026-06-21T01:30:00

## 📊 整体指标

| 指标 | 实际 | 阈值 | 通过 |
|---|---|---|---|
| 分数相关性 (Pearson) | 0.78 | ≥ 0.7 | ✅ |
| 平均绝对偏差 (MAE)   | 15.3 | ≤ 20  | ✅ |
| 档位一致率            | 70%  | ≥ 65% | ✅ |
| 关键词命中率          | 55%  | ≥ 50% | ✅ |

## 📈 按难度分组
...

## ❌ 失败 Case
| Case | 档位 | 偏差 | 原因 |
| case-013-fe-typescript | poor | 38 | LLM 给 73 分 |
```

---

## 扩展指南

### 加新 case

编辑 `apps/api/src/evals/golden-dataset.json`,加一个 case 节点:

```json
{
  "id": "case-031-agent-xxx",
  "position": "AI Agent 工程师",
  "level": "P6",
  "category": "rag",
  "difficulty": "medium",
  "question": "你的问题?",
  "responses": [
    {
      "level": "excellent",
      "answer": "...",
      "expectedScore": 90,
      "expectedCorrectness": 0.9,
      "expectedDepth": 0.9,
      "expectedCompleteness": 0.9,
      "expectedFeedbackKeywords": ["关键词1", "关键词2"],
      "reason": "为什么这个分数"
    },
    {
      "level": "poor",
      ...
    }
  ],
  "tags": ["rag", "embedding"],
  "notes": "考察..."
}
```

然后跑 `--validate` 校验 + 跑全量看新 case 评分是否合理。

### 改评分 prompt

改 `apps/api/src/evals/eval-runner.ts` 的 `SCORING_PROMPT` 常量,跑全量 eval,看指标变化:

```diff
- 平均绝对偏差 (MAE)  15.3 → 18.7 ❌ 退化
+ 档位一致率           70% → 78% ✅ 提升
```

→ 通过对比决定是否采用新 prompt。

### 接 Langfuse Dataset (可选)

在 `eval-runner.ts` 的 `runCase` 里加 Langfuse Dataset API,把 case 推上去 + 关联 trace,长期追踪评分变化。

---

## 文件结构

```
apps/api/src/evals/
├── golden-dataset.json          # 30 条 case 数据
├── golden-dataset.schema.ts     # Zod schema 强校验
├── eval-runner.ts               # 核心: 跑模型 → 对比 → 算指标
├── eval-reporter.ts             # 输出 JSON + Markdown 报告
├── README.md                    # 本文件
└── reports/                     # 生成的报告 (gitignore)
    ├── eval-report-2026-06-21T01-30-00.json
    └── eval-report-2026-06-21T01-30-00.md

apps/api/src/__tests__/
└── golden-dataset.eval.spec.ts  # vitest 集成 (CI 门禁)
```

---

## 面试话术

> "我做了 30 条 Golden Dataset,每题多档回答,跑 4 个核心指标(分数相关 / MAE / 档位一致率 / 关键词命中率)。改了 prompt 必须先跑回归,5 个指标全部达标才能发版。"
>
> "未来可以接 Langfuse Dataset,把 case 关联到 trace,长期追踪评分漂移。"

---

## TODO (未来扩展)

- [ ] 接 Langfuse Dataset API
- [ ] 加 pairwise 比较(A/B prompt 哪个好)
- [ ] 加人工评测入口(把 LLM 输出存盘,人工 review)
- [ ] 多模型对比(Qwen vs DeepSeek 谁评分更准)
- [ ] Auto-evolve:case 自动挖掘(从生产对话里找"评分漏判"的样本)
