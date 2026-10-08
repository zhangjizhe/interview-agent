import { answerCacheFingerprint } from './answer-cache.fingerprint';

describe('answer request fingerprint', () => {
  const params = { messages: [{ role: 'user' as const, content: 'same input' }] };
  const identity = { organizationId: 'org', userId: 'user' };
  const provider = { name: 'qwen', defaultModel: 'model' };
  const limits = { planId: 'plan', maxInputBytes: 1000, maxOutputTokens: 100, monthlyLlmCalls: 10 };
  const fingerprint = (p: any = params, l = limits, mode: 'chat' | 'stream' = 'chat') => answerCacheFingerprint(p, identity, provider, l, mode);
  it('treats object property order and effective defaults consistently', () => {
    expect(fingerprint()).toBe(fingerprint({ messages: [{ content: 'same input', role: 'user' }], temperature: 0.7, maxTokens: 100 }));
    expect(fingerprint({ ...params, maxTokens: 200 })).toBe(fingerprint({ ...params, maxTokens: 100 }));
    expect(fingerprint()).not.toBe(fingerprint(params, limits, 'stream'));
  });
  it.each([NaN, Infinity, -1, 0, 1.5])('bypasses invalid output limit %s', maxTokens => {
    expect(fingerprint({ ...params, maxTokens })).toBeUndefined();
  });
  it('bypasses oversized input, invalid plans, circular and non-JSON context', () => {
    expect(fingerprint(params, { ...limits, maxInputBytes: 1 })).toBeUndefined();
    expect(fingerprint(params, { ...limits, monthlyLlmCalls: 0 })).toBeUndefined();
    const cycle: any = {}; cycle.self = cycle;
    expect(fingerprint({ ...params, cycle })).toBeUndefined();
    expect(fingerprint({ ...params, timestamp: new Date() })).toBeUndefined();
    expect(fingerprint({ ...params, messages: [{ role: 'user', content: ['multimodal'] }] })).toBeUndefined();
  });
});
