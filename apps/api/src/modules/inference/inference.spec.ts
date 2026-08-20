import { categoryForPosition } from './interview-ontology';
import { inferInterviewRouting } from './interview-routing-inference';
import { inferReleaseGate } from './release-gate-inference';

describe('Interview inference', () => {
  it('routes AI Agent roles to the agent ontology instead of algorithms', () => {
    expect(categoryForPosition('AI Agent 工程师')).toBe('agent');
  });

  it('forces one targeted follow-up for weak evidence', () => {
    const decision = inferInterviewRouting({
      completedTask: {
        id: 'task-1',
        type: 'QUESTION',
        question: '如何为生产 Agent 建立离线评测？',
        category: 'agent',
        difficulty: 'hard',
        status: 'COMPLETED',
        context: { capabilities: ['evaluation'] },
      },
      tasks: [],
      llmDecision: {
        score: 0.3,
        missingPoints: ['回归测试'],
        shouldFollowUp: false,
        followUpQuestion: null,
        followUpReason: null,
        shouldAdvance: true,
        advancedQuestion: '请设计线上回归系统。',
      },
    });

    expect(decision.outcome.createFollowUp).toBe(true);
    expect(decision.outcome.createAdvanced).toBe(false);
    expect(decision.matchedRules).toContain('IR-001:low-score-missing-evidence');
  });

  it('does not create a repeated follow-up for the same question', () => {
    const decision = inferInterviewRouting({
      completedTask: {
        id: 'task-1',
        type: 'QUESTION',
        question: '请解释 Agent 工具调用。',
        category: 'agent',
        difficulty: 'medium',
        status: 'COMPLETED',
        context: { capabilities: ['tool-calling'] },
      },
      tasks: [
        {
          id: 'follow-up-1',
          type: 'FOLLOW_UP',
          question: '已有追问',
          category: 'agent',
          difficulty: 'medium',
          status: 'PENDING',
          context: { followUpFrom: 'task-1' },
        },
      ],
      llmDecision: {
        score: 0.2,
        missingPoints: ['错误处理'],
        shouldFollowUp: true,
        followUpQuestion: '请说明错误处理。',
        followUpReason: '验证边界',
        shouldAdvance: false,
        advancedQuestion: null,
      },
    });

    expect(decision.outcome.createFollowUp).toBe(false);
    expect(decision.matchedRules).toContain('IR-003:no-duplicate-follow-up');
  });
});

describe('Release gate inference', () => {
  it('denies publication without a completed evaluation', () => {
    expect(inferReleaseGate(null).outcome.allowed).toBe(false);
  });

  it('denies publication when one evaluation case fails', () => {
    const decision = inferReleaseGate({
      id: 'evaluation-1',
      status: 'COMPLETED',
      score: 1,
      totalCases: 2,
      passedCases: 1,
      failedCases: 1,
      completedAt: new Date(),
    });
    expect(decision.outcome.allowed).toBe(false);
    expect(decision.matchedRules).toContain('RG-003:all-cases-must-pass');
  });

  it('allows publication for a complete passing evaluation', () => {
    const decision = inferReleaseGate({
      id: 'evaluation-1',
      status: 'COMPLETED',
      score: 0.95,
      totalCases: 2,
      passedCases: 2,
      failedCases: 0,
      completedAt: new Date(),
    });
    expect(decision.outcome.allowed).toBe(true);
    expect(decision.matchedRules).toContain('RG-005:release-approved');
  });
});
