import { describe, it, expect } from 'vitest';
import { matchBank, pickQuestions } from '../knowledge-banks';

describe('matchBank', () => {
  it('匹配测试岗位', () => {
    expect(matchBank('高级测试工程师')).toBe('test');
    expect(matchBank('QA Engineer')).toBe('test');
    expect(matchBank('SDET')).toBe('test');
  });

  it('匹配前端岗位', () => {
    expect(matchBank('前端开发工程师')).toBe('frontend');
    expect(matchBank('Frontend Developer')).toBe('frontend');
    expect(matchBank('React 开发工程师')).toBe('frontend');
  });

  it('匹配后端岗位', () => {
    expect(matchBank('后端开发工程师')).toBe('backend');
    expect(matchBank('Backend Engineer')).toBe('backend');
    expect(matchBank('Java 开发工程师')).toBe('backend');
  });

  it('匹配算法岗位', () => {
    expect(matchBank('算法工程师')).toBe('algo');
    expect(matchBank('机器学习工程师')).toBe('algo');
    expect(matchBank('NLP Engineer')).toBe('algo');
  });

  it('未匹配岗位默认走 agent', () => {
    expect(matchBank('AI Agent 工程师')).toBe('agent');
    expect(matchBank('产品经理')).toBe('agent');
    expect(matchBank('项目经理')).toBe('agent');
  });
});

describe('pickQuestions', () => {
  it('返回指定数量的题目', () => {
    const questions = pickQuestions('agent', 5);
    expect(questions).toHaveLength(5);
  });

  it('题目难度分布为 2easy + 2medium + 1hard', () => {
    const questions = pickQuestions('frontend', 5);
    const easy = questions.filter((q) => q.level === 'easy');
    const medium = questions.filter((q) => q.level === 'medium');
    const hard = questions.filter((q) => q.level === 'hard');
    expect(easy.length).toBe(2);
    expect(medium.length).toBe(2);
    expect(hard.length).toBe(1);
  });

  it('每个题库都有题目', () => {
    for (const bank of ['agent', 'frontend', 'test', 'backend', 'algo'] as const) {
      const questions = pickQuestions(bank, 5);
      expect(questions.length).toBeGreaterThan(0);
    }
  });
});
