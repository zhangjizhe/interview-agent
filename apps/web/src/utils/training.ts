export interface TargetJob {
  id: string;
  title: string;
  level: string | null;
  company: string | null;
  jobDescription: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ReadinessSummary {
  available: boolean;
  overallScore: number | null;
  confidence: number;
  missingReasons: string[];
  disclaimer: string;
  components: {
    resumeEvidence: { status: 'AVAILABLE' | 'MISSING'; evidenceCount: number };
    interviewPerformance: { status: 'AVAILABLE' | 'MISSING'; evidenceCount: number };
    skillCoverage: {
      status: 'AVAILABLE' | 'MISSING';
      evidenceCount: number;
      requiredSkillCount: number;
      assessedSkillCount: number;
    };
  };
}

export interface InterviewRecord {
  id: string;
  position: string;
  level: string | null;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';
  startedAt: string;
  endedAt: string | null;
  targetJobId: string | null;
  report: { overallScore: number } | null;
}

export type InterviewAction = 'CONTINUE' | 'OPEN_REPORT' | 'RETRY_EVALUATION';

export function getInterviewAction(interview: InterviewRecord): InterviewAction {
  if (interview.status === 'IN_PROGRESS') return 'CONTINUE';
  if (interview.report) return 'OPEN_REPORT';
  return 'RETRY_EVALUATION';
}

export function readinessLabel(readiness: ReadinessSummary | undefined): string {
  if (!readiness) return '正在加载';
  if (readiness.available && readiness.overallScore !== null) return `${readiness.overallScore} / 100`;
  return '证据不足';
}

export function confidenceLabel(confidence: number): string {
  if (confidence >= 0.75) return '高';
  if (confidence >= 0.4) return '中';
  return '低';
}
