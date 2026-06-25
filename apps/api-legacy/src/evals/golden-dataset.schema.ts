/**
 * Golden Case Zod Schema — 强校验数据集格式
 * 改 schema 时,先跑 `pnpm ts-node src/evals/eval-runner.ts --validate` 验证所有 case
 */
import { z } from 'zod';

export const ResponseLevelSchema = z.enum(['excellent', 'good', 'average', 'poor']);
export type ResponseLevel = z.infer<typeof ResponseLevelSchema>;

export const GoldenResponseSchema = z.object({
  level: ResponseLevelSchema,
  answer: z.string().min(20, '回答至少 20 字'),
  expectedScore: z.number().min(0).max(100),
  expectedCorrectness: z.number().min(0).max(1),
  expectedDepth: z.number().min(0).max(1),
  expectedCompleteness: z.number().min(0).max(1),
  expectedFeedbackKeywords: z.array(z.string()).min(1).max(10),
  reason: z.string().min(10),
});

export const GoldenCaseSchema = z.object({
  id: z.string().regex(/^case-\d{3}-[a-z0-9-]+$/, 'id 必须匹配 case-001-react-hooks 格式 (允许小写字母、数字、连字符)'),
  position: z.string(),
  level: z.string(),
  category: z.string(),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  question: z.string().min(10),
  responses: z.array(GoldenResponseSchema).min(2).max(4), // 每题 2-4 档
  tags: z.array(z.string()),
  notes: z.string().optional(),
});

export const GoldenDatasetSchema = z.object({
  $schema: z.string().optional(),
  version: z.string(),
  description: z.string(),
  metadata: z.object({
    createdAt: z.string(),
    author: z.string(),
    scoringRubric: z.record(z.string(), z.string()),
  }),
  cases: z.array(GoldenCaseSchema).min(10),
});

export type GoldenCase = z.infer<typeof GoldenCaseSchema>;
export type GoldenResponse = z.infer<typeof GoldenResponseSchema>;
export type GoldenDataset = z.infer<typeof GoldenDatasetSchema>;

/**
 * 加载并校验数据集
 * 失败时抛 ZodError,显示具体哪条 case / 哪个字段错
 */
export function loadGoldenDataset(path: string): GoldenDataset {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const raw = require('fs').readFileSync(path, 'utf-8');
  const data = JSON.parse(raw);
  return GoldenDatasetSchema.parse(data);
}
