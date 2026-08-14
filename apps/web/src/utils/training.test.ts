import { describe, expect, it } from 'vitest';
import { confidenceLabel, getInterviewAction, readinessLabel, type InterviewRecord, type ReadinessSummary } from './training';

const baseInterview: InterviewRecord = {
  id: 'interview-1',
  position: '前端开发工程师',
  level: 'P5',
  status: 'COMPLETED',
  startedAt: '2026-08-14T00:00:00.000Z',
  endedAt: null,
  targetJobId: 'job-1',
  report: null,
};

const insufficientReadiness: ReadinessSummary = {
  available: false,
  overallScore: null,
  confidence: 0,
  missingReasons: ['尚未完成可用于准备度的正式面试评价'],
  disclaimer: '准备度是系统估计。',
  components: {
    resumeEvidence: { status: 'AVAILABLE', evidenceCount: 1 },
    interviewPerformance: { status: 'MISSING', evidenceCount: 0 },
    skillCoverage: {
      status: 'MISSING',
      evidenceCount: 0,
      requiredSkillCount: 3,
      assessedSkillCount: 0,
    },
  },
};

describe('training presentation contracts', () => {
  it('does not turn insufficient evidence into a numeric readiness score', () => {
    expect(readinessLabel(insufficientReadiness)).toBe('证据不足');
  });

  it('uses the API score only when readiness is available', () => {
    expect(readinessLabel({ ...insufficientReadiness, available: true, overallScore: 76 })).toBe('76 / 100');
  });

  it('maps interview lifecycle states to candidate-safe recovery actions', () => {
    expect(getInterviewAction({ ...baseInterview, status: 'IN_PROGRESS' })).toBe('CONTINUE');
    expect(getInterviewAction({ ...baseInterview, report: { overallScore: 82 } })).toBe('OPEN_REPORT');
    expect(getInterviewAction(baseInterview)).toBe('RETRY_EVALUATION');
  });

  it('labels confidence without exposing raw internal calculation details', () => {
    expect(confidenceLabel(0)).toBe('低');
    expect(confidenceLabel(0.6)).toBe('中');
    expect(confidenceLabel(0.9)).toBe('高');
  });
});
