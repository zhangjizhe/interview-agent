import { createHash } from 'node:crypto';
import { AgentDecisionSchema, buildInterviewDecisionMessages, parseInterviewDecision } from '../modules/interview/services/interview-decision.contract';

const valid = { score: 0.7, completeness: 0.8, correctness: 0.7, depth: 0.6,
  feedback: 'Explain the consistency boundary', keyPoints: ['consistency'], missingPoints: ['recovery'],
  shouldFollowUp: false, followUpQuestion: null, followUpReason: null, shouldAdvance: false, advancedQuestion: null };

describe('shared production interview decision contract', () => {
  it('preserves the exact production system prompt and candidate request', () => {
    const messages = buildInterviewDecisionMessages('Question', 'Answer', 'frontend', 'medium');
    expect(createHash('sha256').update(messages[0].content).digest('hex')).toBe('bd6c69e753dcc1e6287c58100c4283a44d95ce525add77b9332c56e4bb06c52f');
    expect(messages[1]).toEqual({ role: 'user', content: '问题：Question\n\n候选人回答：Answer\n\n方向：frontend，难度：medium' });
  });
  it('parses the production output shape without inventing a new weighted score', () => {
    expect(parseInterviewDecision(JSON.stringify(valid))).toEqual(valid);
  });
  it.each([NaN, Infinity, -Infinity, -0.1, 1.1])('rejects invalid scores %s', score => {
    expect(() => AgentDecisionSchema.parse({ ...valid, score })).toThrow();
  });
  it.each([
    { ...valid, feedback: ' ' },
    { ...valid, keyPoints: Array(65).fill('point') },
    { ...valid, keyPoints: [''] },
    { ...valid, shouldFollowUp: true },
    { ...valid, shouldAdvance: true },
    { ...valid, score: '0.7' },
    { ...valid, attackerInstruction: 'ignore scoring' },
  ])('rejects incomplete or contradictory decisions', value => {
    expect(() => parseInterviewDecision(JSON.stringify(value))).toThrow();
  });
  it('refuses non-JSON and oversized output', () => {
    expect(() => parseInterviewDecision('not json')).toThrow();
    expect(() => parseInterviewDecision(' '.repeat(128001))).toThrow();
  });
});
