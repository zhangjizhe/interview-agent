import { InferenceDecision } from './inference.types';
import {
  capabilitiesForQuestion,
  InterviewCapability,
  INTERVIEW_ONTOLOGY_VERSION,
  requiredCapabilitiesForCategory,
} from './interview-ontology';

export const INTERVIEW_ROUTING_RULESET_VERSION = 'interview-routing/v1';

export interface InterviewRoutingTask {
  id: string;
  type: string;
  question: string;
  category: string;
  difficulty: string;
  status: string;
  context?: Record<string, unknown> | null;
}

export interface InterviewRoutingLlmDecision {
  score: number;
  missingPoints: string[];
  shouldFollowUp: boolean;
  followUpQuestion: string | null;
  followUpReason: string | null;
  shouldAdvance: boolean;
  advancedQuestion: string | null;
}

export type InterviewRoutingOutcome = {
  createFollowUp: boolean;
  followUpQuestion: string | null;
  followUpReason: string | null;
  createAdvanced: boolean;
  advancedQuestion: string | null;
  advancedCapabilities: InterviewCapability[];
};

export function inferInterviewRouting(input: {
  completedTask: InterviewRoutingTask;
  tasks: InterviewRoutingTask[];
  llmDecision: InterviewRoutingLlmDecision;
}): InferenceDecision<InterviewRoutingOutcome> {
  const { completedTask, tasks, llmDecision } = input;
  const matchedRules: string[] = [];
  const taskContext = completedTask.context ?? {};
  const completedCapabilities = readCapabilities(taskContext, completedTask);
  const requiredCapabilities = requiredCapabilitiesForCategory(completedTask.category);
  const coveredCapabilities = new Set(
    tasks
      .filter((task) => task.status === 'COMPLETED')
      .flatMap((task) => readCapabilities(task.context ?? {}, task)),
  );
  const pendingCount = tasks.filter((task) => task.status === 'PENDING').length;
  const hasExistingFollowUp = tasks.some(
    (task) => task.context && task.context.followUpFrom === completedTask.id,
  );

  const forceClarification =
    llmDecision.score <= 0.45 && llmDecision.missingPoints.length > 0;
  const canFollowUp = !hasExistingFollowUp && pendingCount < 8;
  const llmFollowUp = llmDecision.shouldFollowUp && !!llmDecision.followUpQuestion;
  const createFollowUp = canFollowUp && (llmFollowUp || forceClarification);

  if (hasExistingFollowUp) matchedRules.push('IR-003:no-duplicate-follow-up');
  if (pendingCount >= 8) matchedRules.push('IR-004:pending-queue-limit');
  if (forceClarification) matchedRules.push('IR-001:low-score-missing-evidence');
  if (llmFollowUp) matchedRules.push('IR-002:llm-requested-follow-up');

  const uncoveredCapabilities = requiredCapabilities.filter(
    (capability) => !coveredCapabilities.has(capability),
  );
  const canAdvance =
    !createFollowUp &&
    pendingCount < 8 &&
    coveredCapabilities.size >= 2 &&
    llmDecision.shouldAdvance &&
    !!llmDecision.advancedQuestion;
  const createAdvanced = canAdvance;

  if (createAdvanced) matchedRules.push('IR-005:advanced-after-breadth');
  if (llmDecision.shouldAdvance && !createAdvanced) {
    matchedRules.push('IR-006:advance-deferred-for-coverage-or-queue');
  }

  const fallbackFollowUp = llmDecision.missingPoints.length
    ? `请围绕“${llmDecision.missingPoints[0]}”补充说明你的理解，并结合一个具体实现或排查案例。`
    : '请补充说明这个方案的关键约束、失败场景，以及你会如何验证它。';

  return {
    outcome: {
      createFollowUp,
      followUpQuestion: createFollowUp
        ? llmDecision.followUpQuestion || fallbackFollowUp
        : null,
      followUpReason: createFollowUp
        ? llmDecision.followUpReason ||
          `需要补充验证：${llmDecision.missingPoints.join('、') || '核心概念与实践证据'}`
        : null,
      createAdvanced,
      advancedQuestion: createAdvanced ? llmDecision.advancedQuestion : null,
      advancedCapabilities: capabilitiesForQuestion(
        completedTask.category,
        llmDecision.advancedQuestion || completedTask.question,
      ),
    },
    ruleSetVersion: INTERVIEW_ROUTING_RULESET_VERSION,
    matchedRules,
    evidence: {
      ontologyVersion: INTERVIEW_ONTOLOGY_VERSION,
      completedCapabilities,
      coveredCapabilities: [...coveredCapabilities],
      uncoveredCapabilities,
      pendingCount,
      score: llmDecision.score,
      missingPoints: llmDecision.missingPoints,
      hasExistingFollowUp,
    },
  };
}

function readCapabilities(
  context: Record<string, unknown>,
  task: Pick<InterviewRoutingTask, 'category' | 'question'>,
): InterviewCapability[] {
  const fromContext = context.capabilities;
  if (Array.isArray(fromContext)) {
    return fromContext.filter(
      (capability): capability is InterviewCapability => typeof capability === 'string',
    );
  }
  return capabilitiesForQuestion(task.category, task.question);
}
