/**
 * 难度格式转换 util · 2026-06-25
 *
 * 解决：项目里 4 处用不同格式表示难度
 * - Python retag 脚本：P4-P5 / P5-P6 / P6-P7（范围格式）
 * - QuestionGeneratorService：easy / medium / hard（字符串）
 * - QuestionBankService：P4 / P5 / P6 / P7（单个级别）
 * - DynamicTaskQueueService：easy / medium / hard（字符串）
 *
 * 这个 util 提供：
 * - toEasyMediumHard：所有格式 → easy/medium/hard
 * - toPRange：所有格式 → P4-P5/P5-P6/P6-P7（Python 脚本格式）
 * - toPSingle：所有格式 → P4/P5/P6/P7（QuestionBank 格式）
 * - getNumericLevel：所有格式 → 数字 4/5/6/7（用于排序比较）
 * - isValid：校验是否是合法的难度字符串
 */

export type DifficultyLevel = 'easy' | 'medium' | 'hard';
export type PSingle = 'P4' | 'P5' | 'P6' | 'P7';
export type PRange = 'P4-P5' | 'P5-P6' | 'P6-P7';
export type AnyDifficulty = DifficultyLevel | PSingle | PRange;

const VALID_DIFFICULTIES: ReadonlySet<string> = new Set([
  'easy', 'medium', 'hard',
  'P4', 'P5', 'P6', 'P7',
  'P4-P5', 'P5-P6', 'P6-P7',
]);

/** 任何格式 → easy/medium/hard（UI 友好） */
export function toEasyMediumHard(input: string | null | undefined): DifficultyLevel {
  if (!input) return 'medium';
  const s = input.trim();

  // 已就是 easy/medium/hard
  if (s === 'easy' || s === 'medium' || s === 'hard') return s;

  // P 范围
  if (s === 'P4-P5') return 'easy';
  if (s === 'P5-P6') return 'medium';
  if (s === 'P6-P7') return 'hard';

  // P 单个
  if (s === 'P4' || s === 'P5') return 'easy';
  if (s === 'P6') return 'medium';
  if (s === 'P7') return 'hard';

  // unknown → 默认 medium
  return 'medium';
}

/** 任何格式 → P4-P5/P5-P6/P6-P7（Python retag 脚本格式） */
export function toPRange(input: string | null | undefined): PRange {
  if (!input) return 'P5-P6';
  const s = input.trim();

  if (s === 'P4-P5' || s === 'P5-P6' || s === 'P6-P7') return s;

  if (s === 'P4' || s === 'P5' || s === 'easy') return 'P4-P5';
  if (s === 'P6' || s === 'medium') return 'P5-P6';
  if (s === 'P7' || s === 'hard') return 'P6-P7';

  return 'P5-P6';
}

/** 任何格式 → P4/P5/P6/P7（QuestionBankService level 字段） */
export function toPSingle(input: string | null | undefined): PSingle {
  if (!input) return 'P5';
  const s = input.trim();

  if (s === 'P4' || s === 'P5' || s === 'P6' || s === 'P7') return s;

  // 范围取上限
  if (s === 'P4-P5') return 'P5';
  if (s === 'P5-P6') return 'P6';
  if (s === 'P6-P7') return 'P7';

  if (s === 'easy') return 'P5';
  if (s === 'medium') return 'P6';
  if (s === 'hard') return 'P7';

  return 'P5';
}

/** 任何格式 → 数字 4-7（用于排序比较） */
export function getNumericLevel(input: string | null | undefined): number {
  if (!input) return 5;
  const s = input.trim();

  // P 范围取中位数
  if (s === 'P4-P5') return 5;
  if (s === 'P5-P6') return 6;
  if (s === 'P6-P7') return 7;

  if (s === 'P4') return 4;
  if (s === 'P5') return 5;
  if (s === 'P6') return 6;
  if (s === 'P7') return 7;

  // easy/medium/hard
  if (s === 'easy') return 5;
  if (s === 'medium') return 6;
  if (s === 'hard') return 7;

  return 5;
}

/** 校验是否合法难度字符串 */
export function isValidDifficulty(input: string | null | undefined): input is AnyDifficulty {
  return typeof input === 'string' && VALID_DIFFICULTIES.has(input.trim());
}

/** 难度区间匹配（候选人 P 级 vs 题目难度） */
export function isDifficultyMatch(
  candidateLevel: PSingle,
  questionDifficulty: string,
  tolerance: number = 0,
): boolean {
  const candidate = getNumericLevel(candidateLevel);
  const question = getNumericLevel(questionDifficulty);
  return Math.abs(candidate - question) <= tolerance;
}