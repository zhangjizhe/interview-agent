import { toCandidateStreamEvent } from '../modules/interview/services/candidate-stream-event.util';

describe('candidate stream event boundary', () => {
  it('keeps only candidate-visible text', () => {
    expect(toCandidateStreamEvent({ type: 'token', content: '请介绍你的项目。' }))
      .toEqual({ type: 'token', content: '请介绍你的项目。' });
  });

  it.each(['thinking', 'meta', 'tool_call', 'tool_result', 'searching', 'recalling', 'token_usage'])(
    'drops internal %s events',
    (type) => expect(toCandidateStreamEvent({ type, content: 'internal detail' })).toBeNull(),
  );

  it('does not expose provider errors', () => {
    expect(toCandidateStreamEvent({ type: 'error', error: 'Qwen API key rejected' }))
      .toEqual({ type: 'error', error: '当前回答暂时无法处理，请稍后重试。' });
  });
});
