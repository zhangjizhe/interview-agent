import type { AgentEvent } from '@interview-agent/shared-types';

export function isCandidateVisibleAgentEvent(event: AgentEvent): boolean {
  return event.type === 'token' || event.type === 'error' || event.type === 'done';
}
