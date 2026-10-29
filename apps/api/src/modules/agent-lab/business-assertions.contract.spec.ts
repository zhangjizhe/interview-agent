import {
  BUSINESS_ASSERTIONS_VERSION,
  businessContractHash,
  evaluateBusinessAssertions,
  validateBusinessAssertions,
  validateBusinessEvaluatorConfig,
} from './business-assertions.contract';

const output = { id: 'decision', source: 'response-json', path: ['decision'], op: 'equals', expected: 'FOLLOW_UP' };
const contract = (assertions: unknown[] = [output]) => ({ contractVersion: BUSINESS_ASSERTIONS_VERSION, assertions });
const validate = (value: unknown, adapter = 'single-agent-v1') => validateBusinessAssertions(value, adapter);

describe('bounded deterministic business assertions', () => {
  it('checks real JSON field values instead of keyword mentions or a metadata declaration', () => {
    const c = validate(contract([output, { id: 'score', source: 'response-json', path: ['score'], op: 'number-range', minimum: 0.5, maximum: 1 }]));
    expect(evaluateBusinessAssertions(c, { id: 'run', output: { response: JSON.stringify({ decision: 'ADVANCE', score: 12, summary: 'FOLLOW_UP score 0.75' }) } }).every(item => item.passed)).toBe(false);
    expect(evaluateBusinessAssertions(c, { id: 'run', output: { response: JSON.stringify({ decision: 'FOLLOW_UP', score: 0.75 }) } }).every(item => item.passed)).toBe(true);
  });

  it.each(['plain FOLLOW_UP text', '```json\n{"decision":"FOLLOW_UP"}\n```', '{"decision":', JSON.stringify({ decision: 'FOLLOW_UP', array: Array(101).fill(0) })])('rejects non-JSON or unbounded response: %s', response => {
    expect(evaluateBusinessAssertions(validate(contract()), { id: 'run', output: { response } })[0].passed).toBe(false);
  });

  it('supports bounded arrays, forbidden output text, null values and existing own properties', () => {
    const c = validate(contract([
      { id: 'array', source: 'response-json', path: ['references'], op: 'array-length', minimum: 1, maximum: 3 },
      { id: 'privacy', source: 'response-json', path: ['summary'], op: 'text-excludes', forbidden: ['private@example.com'] },
      { id: 'nullable', source: 'response-json', path: ['nullable'], op: 'equals', expected: null },
      { id: 'exists', source: 'response-json', path: ['references', '0', 'id'], op: 'exists' },
    ]));
    const response = JSON.stringify({ references: [{ id: 'evidence-1' }], summary: 'safe', nullable: null });
    expect(evaluateBusinessAssertions(c, { id: 'run', output: { response } }).every(item => item.passed)).toBe(true);
    const leaked = response.replace('safe', 'private@example.com');
    expect(evaluateBusinessAssertions(c, { id: 'run', output: { response: leaked } }).find(item => item.id === 'privacy')?.passed).toBe(false);
  });

  it.each([
    contract([]), contract(Array(33).fill(output)), contract([output, output]),
    contract([{ ...output, source: 'response' }]), contract([{ ...output, op: 'eval', expression: 'true' }]),
    contract([{ ...output, path: ['constructor'] }]), contract([{ ...output, path: [] }]),
    contract([{ ...output, expected: { arbitrary: true } }]), contract([{ ...output, semanticQuality: 'proven' }]),
    contract([{ ...output, op: 'number-range', minimum: 0, maximum: Infinity }]),
    contract([{ id: 'negative', source: 'trace', op: 'forbidden-tool', toolName: 'send_email' }]),
    contract([{ id: 'empty-evidence', source: 'trace', op: 'event-exists', eventType: 'model.end' }]),
  ])('rejects unsupported, forged or unbounded contract before execution: %j', value => {
    expect(() => validate(value)).toThrow('业务断言无效');
  });

  it('requires supported actual Run events and preserves their references; empty or foreign traces never pass', () => {
    const eventAssertion = { id: 'model-evidence', source: 'trace', op: 'event-exists', eventType: 'model.end', step: 'configured-agent' };
    const c = validate(contract([output, eventAssertion]));
    const run = { id: 'run', output: { response: '{"decision":"FOLLOW_UP"}' } };
    expect(evaluateBusinessAssertions(c, run, [])[1].passed).toBe(false);
    expect(evaluateBusinessAssertions(c, run, [{ runId: 'foreign', seq: 1, type: 'model.end', step: 'configured-agent' }])[1].passed).toBe(false);
    expect(evaluateBusinessAssertions(c, run, [{ runId: 'run', seq: 2, type: 'model.end', step: 'configured-agent' }])[1]).toMatchObject({ passed: true, evidence: { runId: 'run', seq: 2, eventType: 'model.end' } });
    expect(() => validate(contract([output, eventAssertion]), 'interview-multi-agent')).toThrow('当前适配器不支持');
    expect(() => validate(contract([output, eventAssertion]), 'finite-workflow-v1')).toThrow('当前适配器不支持');
  });

  it('does not permit evaluator config to declare quality or grant unsupported scope', () => {
    expect(() => validateBusinessEvaluatorConfig({ contractVersion: BUSINESS_ASSERTIONS_VERSION })).not.toThrow();
    expect(() => validateBusinessEvaluatorConfig({ contractVersion: BUSINESS_ASSERTIONS_VERSION, scope: 'interview-quality' })).toThrow();
    expect(() => validateBusinessEvaluatorConfig({})).toThrow();
  });

  it('hashes the exact equivalent rubric independently of key or Case insertion order', () => {
    const config = { contractVersion: BUSINESS_ASSERTIONS_VERSION };
    const a = { key: 'aa', expectedOutput: contract() };
    const b = { key: 'bb', expectedOutput: contract([{ ...output, expected: 'ADVANCE' }]) };
    expect(businessContractHash(config, [a, b])).toMatch(/^[a-f0-9]{64}$/);
    expect(businessContractHash(config, [a, b])).toBe(businessContractHash(config, [b, a]));
    expect(businessContractHash(config, [a])).not.toBe(businessContractHash(config, [b]));
  });
});
