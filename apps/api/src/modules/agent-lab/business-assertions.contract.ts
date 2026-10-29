import { createHash } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';

export const BUSINESS_ASSERTIONS_VERSION = 'business-assertions/v1';
export const BUSINESS_EVIDENCE_VERSION = 'evaluation-evidence/v1';

type OutputAssertion = {
  id: string;
  source: 'response-json';
  path: string[];
} & (
  { op: 'exists' }
  | { op: 'equals'; expected: string | number | boolean | null }
  | { op: 'number-range' | 'array-length'; minimum: number; maximum: number }
  | { op: 'text-excludes'; forbidden: string[] }
);
type EventAssertion = { id: string; source: 'trace'; op: 'event-exists'; eventType: string; step?: string };
export type BusinessAssertion = OutputAssertion | EventAssertion;
export type BusinessAssertions = { contractVersion: typeof BUSINESS_ASSERTIONS_VERSION; assertions: BusinessAssertion[] };
export type AssertionResult = { id: string; passed: boolean; reason: string; evidence: Record<string, unknown> };

function fail(message: string): never { throw new BadRequestException(`业务断言无效：${message}`); }
const record = (value: unknown): value is Record<string, any> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const boundedText = (value: unknown, max: number): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const only = (value: Record<string, unknown>, keys: string[]) => {
  if (Object.keys(value).some(key => !keys.includes(key))) fail('包含不支持的字段');
};

export function validateBusinessEvaluatorConfig(config: unknown) {
  if (!record(config)) fail('Evaluator config 必须明确合同版本');
  only(config, ['contractVersion']);
  if (config.contractVersion !== BUSINESS_ASSERTIONS_VERSION) fail('不支持的合同版本');
}

/** No code, regex, arbitrary expression, negative tool claim or semantic-quality declaration. */
export function validateBusinessAssertions(value: unknown, adapter: unknown, validateTraceAdapter = true): BusinessAssertions {
  if (!record(value)) fail('Case expectedOutput 必须是对象');
  only(value, ['contractVersion', 'assertions']);
  if (value.contractVersion !== BUSINESS_ASSERTIONS_VERSION) fail('Case 合同版本不匹配');
  if (!Array.isArray(value.assertions) || value.assertions.length < 1 || value.assertions.length > 32) fail('每个 Case 须有1至32条断言');
  const ids = new Set<string>();
  let outputAssertions = 0;
  for (const assertion of value.assertions) {
    if (!record(assertion) || !boundedText(assertion.id, 64) || !/^[a-z][a-z0-9-]*$/.test(assertion.id) || ids.has(assertion.id)) fail('断言 id 必须有效且唯一');
    ids.add(assertion.id);
    if (assertion.source === 'trace') {
      only(assertion, ['id', 'source', 'op', 'eventType', 'step']);
      const supported = !validateTraceAdapter ? ['model.start', 'model.end', 'workflow.node.start', 'workflow.node.end']
        : adapter === 'single-agent-v1' ? ['model.start', 'model.end']
        : adapter === 'finite-workflow-v1' ? ['workflow.node.start', 'workflow.node.end'] : [];
      if (assertion.op !== 'event-exists' || !supported.includes(assertion.eventType)) fail('当前适配器不支持该 Trace 断言；缺少记录不证明未发生调用');
      if (assertion.step !== undefined && !boundedText(assertion.step, 64)) fail('step 须为1至64字符');
      continue;
    }
    if (assertion.source !== 'response-json') fail('仅支持 response-json 或受限 Trace 正向事件断言');
    outputAssertions += 1;
    if (!Array.isArray(assertion.path) || assertion.path.length < 1 || assertion.path.length > 8
      || assertion.path.some((key: unknown) => !boundedText(key, 64) || ['__proto__', 'prototype', 'constructor'].includes(key))) fail('path 须为1至8个安全属性名');
    const common = ['id', 'source', 'path', 'op'];
    if (assertion.op === 'exists') only(assertion, common);
    else if (assertion.op === 'equals') {
      only(assertion, [...common, 'expected']);
      if (!Object.hasOwn(assertion, 'expected') || !(assertion.expected === null || typeof assertion.expected === 'boolean'
        || (typeof assertion.expected === 'number' && Number.isFinite(assertion.expected))
        || (typeof assertion.expected === 'string' && assertion.expected.length <= 1000))) fail('equals expected 只支持有界 JSON 原始值');
    } else if (assertion.op === 'number-range' || assertion.op === 'array-length') {
      only(assertion, [...common, 'minimum', 'maximum']);
      if (!Number.isFinite(assertion.minimum) || !Number.isFinite(assertion.maximum) || assertion.minimum > assertion.maximum) fail('数值上下界必须有效');
      if (assertion.op === 'array-length' && (!Number.isInteger(assertion.minimum) || !Number.isInteger(assertion.maximum)
        || assertion.minimum < 0 || assertion.maximum > 100)) fail('数组长度须在0至100之间');
    } else if (assertion.op === 'text-excludes') {
      only(assertion, [...common, 'forbidden']);
      if (!Array.isArray(assertion.forbidden) || assertion.forbidden.length < 1 || assertion.forbidden.length > 16
        || assertion.forbidden.some((item: unknown) => !boundedText(item, 256))) fail('forbidden 须为1至16个有界文本');
    } else fail('不支持的输出断言操作');
  }
  if (!outputAssertions) fail('至少需要一条实际输出合同断言；Trace 出现不等于业务质量');
  return JSON.parse(JSON.stringify(value));
}

export function businessContractHash(config: unknown, cases: Array<{ key: string; expectedOutput: unknown }>) {
  // Explicit canonical form: property order in submitted JSON is immaterial.
  const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical)
    : record(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  return createHash('sha256').update(JSON.stringify(canonical({ config, cases: [...cases].sort((a, b) => a.key.localeCompare(b.key))
    .map(item => ({ key: item.key, expectedOutput: item.expectedOutput })) }))).digest('hex');
}

export function evaluateBusinessAssertions(contract: BusinessAssertions, run: { id: string; output?: any }, events: Array<Record<string, any>> = []): AssertionResult[] {
  let parsed: unknown;
  let parseError: string | undefined;
  try {
    const response = run.output?.response;
    if (typeof response !== 'string' || Buffer.byteLength(response, 'utf8') > 65536) throw new Error('response 须为不超过64KiB的 JSON 文本');
    parsed = JSON.parse(response);
    let nodes = 0;
    const bound = (value: any, depth = 0) => {
      if (++nodes > 1000 || depth > 8) throw new Error('JSON 超过有界合同限制');
      if (Array.isArray(value)) {
        if (value.length > 100) throw new Error('JSON 数组超过100项');
        value.forEach(item => bound(item, depth + 1));
      } else if (record(value)) {
        if (Object.keys(value).length > 100) throw new Error('JSON 对象超过100属性');
        Object.values(value).forEach(item => bound(item, depth + 1));
      } else if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('JSON 数值必须有限');
    };
    bound(parsed);
  } catch (error: any) { parseError = error.message; }

  return contract.assertions.map(assertion => {
    if (assertion.source === 'trace') {
      const event = events.find(item => item.runId === run.id && Number.isSafeInteger(item.seq) && item.seq > 0
        && item.type === assertion.eventType && (assertion.step === undefined || item.step === assertion.step));
      return { id: assertion.id, passed: Boolean(event), reason: event ? '必要事件已观测' : '未找到当前 Run 的必要事件',
        evidence: event ? { runId: run.id, seq: event.seq, eventType: event.type, ...(event.callId ? { callId: event.callId } : {}) } : { runId: run.id, eventType: assertion.eventType } };
    }
    if (parseError) return { id: assertion.id, passed: false, reason: parseError, evidence: { runId: run.id, source: 'response-json' } };
    let value: any = parsed;
    let exists = true;
    for (const key of assertion.path) {
      if (!(record(value) || Array.isArray(value)) || !Object.hasOwn(value, key)) { exists = false; break; }
      value = value[key];
    }
    let passed = exists;
    if (exists && assertion.op === 'equals') passed = value === assertion.expected;
    if (exists && assertion.op === 'number-range') passed = typeof value === 'number' && Number.isFinite(value) && value >= assertion.minimum && value <= assertion.maximum;
    if (exists && assertion.op === 'array-length') passed = Array.isArray(value) && value.length >= assertion.minimum && value.length <= assertion.maximum;
    if (exists && assertion.op === 'text-excludes') passed = typeof value === 'string' && assertion.forbidden.every(text => !value.includes(text));
    return { id: assertion.id, passed, reason: passed ? '确定性合同断言通过' : exists ? '字段值不满足断言' : '输出缺少目标字段',
      evidence: { runId: run.id, source: 'response-json', path: assertion.path, ...(exists ? { actual: value } : {}) } };
  });
}
