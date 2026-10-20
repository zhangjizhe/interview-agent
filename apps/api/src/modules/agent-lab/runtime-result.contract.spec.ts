import { normalizeRuntimeOutput, runtimeFailureEvidence } from './runtime-result.contract';
describe('Runtime final output completion boundary', () => {
  it.each([null, [], 'text', {}, { response: false }, { output: null, response: 'fallback' }, { output: [], response: 'fallback' }, { output: { response: 1 } }])('rejects malformed result %j', value => {
    expect(() => normalizeRuntimeOutput(value)).toThrow('运行适配器最终输出无效');
  });
  it('preserves structured configured output without merging unrelated top-level fields', () => {
    const output = { response: 'Synthetic configured answer', nodes: [{ id: 'one' }] };
    expect(normalizeRuntimeOutput({ output, response: 'ignored' })).toBe(output);
  });
  it('preserves legacy text and supported diagnostic fields including an empty string', () => {
    expect(normalizeRuntimeOutput({ response: '', intent: 'synthetic', threadId: 'thread', extra: 'not-public' })).toEqual({ response: '', intent: 'synthetic', plan: undefined, pastSteps: undefined, steps: undefined, threadId: 'thread' });
  });
});

describe('Malformed-output metadata preservation', () => {
  it('rejects sparse models without replacing unknown usage with zero', () => {
    const tokenUsage = { promptTokens: 4, completionTokens: 2, totalTokens: 6, calls: 1, models: new Array(1) };
    expect(runtimeFailureEvidence({ estimatedCostCny: 0.012, tokenUsage })).toEqual({ estimatedCost: 0.012 });
  });
  it('keeps valid reported estimates without treating them as actual billing', () => {
    const tokenUsage = { promptTokens: 4, completionTokens: 2, totalTokens: 6, calls: 1, models: ['synthetic'] };
    expect(runtimeFailureEvidence({ estimatedCostCny: 0.012, tokenUsage })).toEqual({ estimatedCost: 0.012, tokenUsage });
  });
  it.each([undefined, null, { estimatedCostCny: NaN, tokenUsage: {} }, { estimatedCostCny: -1, tokenUsage: { calls: '1' } }])('does not turn unknown or malformed metadata into zero: %j', value => {
    expect(runtimeFailureEvidence(value)).toEqual({});
  });
});
