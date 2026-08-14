import { describe, expect, it } from 'vitest';
import { isCandidateVisibleAgentEvent } from './candidateEvents';

describe('candidate event boundary', () => {
  it.each(['token', 'error', 'done'])('allows candidate-visible %s events', (type) => {
    expect(isCandidateVisibleAgentEvent({ type } as any)).toBe(true);
  });

  it.each(['thinking', 'meta', 'tool_call', 'tool_result', 'searching', 'recalling', 'token_usage'])(
    'drops internal %s events',
    (type) => expect(isCandidateVisibleAgentEvent({ type } as any)).toBe(false),
  );
});
