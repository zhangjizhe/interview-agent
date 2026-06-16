import { AGENT_QUESTION_BANK, Question } from './agent.bank';
import { FRONTEND_QUESTION_BANK } from './frontend.bank';
import { TEST_QUESTION_BANK } from './test.bank';

export type { Question };
export type BankKey = 'agent' | 'frontend' | 'test';

const BANKS: Record<BankKey, Question[]> = {
  agent: AGENT_QUESTION_BANK,
  frontend: FRONTEND_QUESTION_BANK,
  test: TEST_QUESTION_BANK,
};

/**
 * 根据岗位匹配知识库
 * 匹配顺序：test > frontend > agent（前者更具体）
 */
export function matchBank(position: string): BankKey {
  const p = position.toLowerCase();
  if (
    p.includes('测试') || p.includes('qa') || p.includes('test') ||
    p.includes('sdet') || p.includes('质量')
  ) {
    return 'test';
  }
  if (p.includes('前端') || p.includes('frontend') || p.includes('react') || p.includes('vue')) {
    return 'frontend';
  }
  return 'agent';
}

/**
 * 选题策略：2 易 + 2 中 + 1 硬
 */
export function pickQuestions(bank: BankKey, count = 5): Question[] {
  const pool = BANKS[bank] || [];
  const easy = pool.filter((q) => q.level === 'easy');
  const medium = pool.filter((q) => q.level === 'medium');
  const hard = pool.filter((q) => q.level === 'hard');

  const pick = (arr: Question[], n: number) =>
    [...arr].sort(() => Math.random() - 0.5).slice(0, n);

  return [
    ...pick(easy, 2),
    ...pick(medium, 2),
    ...pick(hard, 1),
  ].slice(0, count);
}

/**
 * 评分 rubric：题目 + 考察点 + 参考答案
 */
export function buildScoringRubric(bank: BankKey, questions: Question[]): string {
  const relevantQs = questions.length > 0 ? questions : BANKS[bank] || [];
  return relevantQs
    .map(
      (q, i) =>
        `【题目 ${i + 1}】${q.question}\n` +
        `【评分要点】${q.keyPoints.join(' / ')}\n` +
        `【参考答案】${q.referenceAnswer}\n`,
    )
    .join('\n---\n');
}

export const ALL_BANKS = BANKS;
