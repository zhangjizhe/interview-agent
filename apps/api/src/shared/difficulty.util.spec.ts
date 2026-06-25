/**
 * difficulty util 测试 · 2026-06-25
 *
 * 验证 4 种格式互转：
 * - easy / medium / hard（QuestionGeneratorService / DynamicTaskQueueService）
 * - P4 / P5 / P6 / P7 单个（QuestionBankService）
 * - P4-P5 / P5-P6 / P6-P7 范围（Python retag 脚本）
 * - null / undefined → 默认值
 *
 * 测试 isDifficultyMatch：候选人 P 级 vs 题目难度匹配（含 tolerance）
 */
import {
  toEasyMediumHard,
  toPRange,
  toPSingle,
  getNumericLevel,
  isValidDifficulty,
  isDifficultyMatch,
} from './difficulty.util';

describe('difficulty util · toEasyMediumHard', () => {
  it.each([
    ['easy', 'easy'],
    ['medium', 'medium'],
    ['hard', 'hard'],
    ['P4', 'easy'],
    ['P5', 'easy'],
    ['P6', 'medium'],
    ['P7', 'hard'],
    ['P4-P5', 'easy'],
    ['P5-P6', 'medium'],
    ['P6-P7', 'hard'],
    ['', 'medium'],
    [null, 'medium'],
    [undefined, 'medium'],
    ['unknown', 'medium'],
  ])('toEasyMediumHard(%j) === %j', (input, expected) => {
    expect(toEasyMediumHard(input as any)).toBe(expected);
  });

  it('toEasyMediumHard 处理前后空格', () => {
    expect(toEasyMediumHard('  easy  ')).toBe('easy');
    expect(toEasyMediumHard(' P5-P6 ')).toBe('medium');
  });
});

describe('difficulty util · toPRange', () => {
  it.each([
    ['P4-P5', 'P4-P5'],
    ['P5-P6', 'P5-P6'],
    ['P6-P7', 'P6-P7'],
    ['P4', 'P4-P5'],
    ['P5', 'P4-P5'],
    ['P6', 'P5-P6'],
    ['P7', 'P6-P7'],
    ['easy', 'P4-P5'],
    ['medium', 'P5-P6'],
    ['hard', 'P6-P7'],
    [null, 'P5-P6'],
    ['unknown', 'P5-P6'],
  ])('toPRange(%j) === %j', (input, expected) => {
    expect(toPRange(input as any)).toBe(expected);
  });
});

describe('difficulty util · toPSingle', () => {
  it.each([
    ['P4', 'P4'],
    ['P5', 'P5'],
    ['P6', 'P6'],
    ['P7', 'P7'],
    ['P4-P5', 'P5'],
    ['P5-P6', 'P6'],
    ['P6-P7', 'P7'],
    ['easy', 'P5'],
    ['medium', 'P6'],
    ['hard', 'P7'],
    [null, 'P5'],
  ])('toPSingle(%j) === %j', (input, expected) => {
    expect(toPSingle(input as any)).toBe(expected);
  });
});

describe('difficulty util · getNumericLevel', () => {
  it.each([
    ['P4', 4],
    ['P5', 5],
    ['P6', 6],
    ['P7', 7],
    ['P4-P5', 5],
    ['P5-P6', 6],
    ['P6-P7', 7],
    ['easy', 5],
    ['medium', 6],
    ['hard', 7],
  ])('getNumericLevel(%j) === %j', (input, expected) => {
    expect(getNumericLevel(input)).toBe(expected);
  });

  it('getNumericLevel 单调递增：P4 < P5 < P6 < P7', () => {
    expect(getNumericLevel('P4')).toBeLessThan(getNumericLevel('P5'));
    expect(getNumericLevel('P5')).toBeLessThan(getNumericLevel('P6'));
    expect(getNumericLevel('P6')).toBeLessThan(getNumericLevel('P7'));
  });
});

describe('difficulty util · isValidDifficulty', () => {
  it.each([
    'easy', 'medium', 'hard',
    'P4', 'P5', 'P6', 'P7',
    'P4-P5', 'P5-P6', 'P6-P7',
  ])('isValidDifficulty(%j) === true', (input) => {
    expect(isValidDifficulty(input)).toBe(true);
  });

  it.each(['', 'unknown', 'P8', 'p4', 'p4-p5', 'EASY', null, undefined])(
    'isValidDifficulty(%j) === false',
    (input: any) => {
      expect(isValidDifficulty(input)).toBe(false);
    },
  );
});

describe('difficulty util · isDifficultyMatch（候选人 P 级 vs 题目）', () => {
  it('P6 候选人 vs P6 题目 → 完美匹配', () => {
    expect(isDifficultyMatch('P6', 'P6-P7', 0)).toBe(false); // P6(6) vs P6-P7(7) |diff|=1 > 0
    expect(isDifficultyMatch('P6', 'P6', 0)).toBe(true);
    expect(isDifficultyMatch('P6', 'P5-P6', 0)).toBe(true); // P5-P6 中位数=6 = P6 → 匹配
  });

  it('P6 候选人 vs P5-P6 题目 + tolerance=1 → 匹配', () => {
    expect(isDifficultyMatch('P6', 'P5-P6', 1)).toBe(true);
  });

  it('P5 候选人 vs P6-P7 题目 + tolerance=0 → 不匹配', () => {
    expect(isDifficultyMatch('P5', 'P6-P7', 0)).toBe(false);
  });

  it('P5 候选人 vs P6-P7 题目 + tolerance=2 → 匹配', () => {
    expect(isDifficultyMatch('P5', 'P6-P7', 2)).toBe(true);
  });

  it('混合格式匹配：候选人 P6 vs 题目 hard → 匹配', () => {
    expect(isDifficultyMatch('P6', 'hard', 0)).toBe(false); // 数字 6 vs 7
    expect(isDifficultyMatch('P6', 'hard', 1)).toBe(true);
  });

  it('混合格式匹配：候选人 P7 vs 题目 P5-P6 → 不匹配', () => {
    // P7(7) vs P5-P6(6) |diff|=1, tolerance=1 → true（容忍 1 档差）
    // 不容忍差 2 档 → 用 tolerance=0
    expect(isDifficultyMatch('P7', 'P5-P6', 0)).toBe(false);
  });
});

describe('difficulty util · 端到端示例', () => {
  it('Python retag 脚本的 P6-P7 难度 → 前端 UI easy/medium/hard', () => {
    // Python 输出 P6-P7
    const pythonOutput = 'P6-P7';
    // 前端用 easy/medium/hard
    expect(toEasyMediumHard(pythonOutput)).toBe('hard');
    // QuestionBankService 存 P4-P7 单个
    expect(toPSingle(pythonOutput)).toBe('P7');
  });

  it('候选人 P5 + 题目 P4-P5 + tolerance=0 → 匹配', () => {
    expect(isDifficultyMatch('P5', 'P4-P5', 0)).toBe(true);
  });

  it('空 / null → 默认 medium / P5-P6', () => {
    expect(toEasyMediumHard(null)).toBe('medium');
    expect(toPRange(undefined)).toBe('P5-P6');
    expect(toPSingle('')).toBe('P5');
  });
});