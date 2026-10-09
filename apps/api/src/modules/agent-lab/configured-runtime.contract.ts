import { BadRequestException } from '@nestjs/common';

export type WorkflowNode = { id: string; agentVersionId: string; versionHash?: string; inputFrom: 'input' | 'previous'; next?: string; branch?: { contains: string; then: string; else: string } };
export type RuntimeDefinition = { adapter: 'single-agent-v1' | 'finite-workflow-v1'; maxEstimatedCostCny: number; maxDurationMs: number; nodes?: WorkflowNode[] };
const reject = (message: string): never => { throw new BadRequestException(message); };
const object = (value: any) => value && typeof value === 'object' && !Array.isArray(value);
const keys = (value: any, allowed: string[]) => {
  if (!object(value) || Object.keys(value).some(key => !allowed.includes(key))) reject('配置包含不支持的字段');
};
export function validateConfiguredVersion(version: any): RuntimeDefinition {
  const runtime = version.runtimeConfig;
  keys(runtime, ['adapter', 'maxEstimatedCostCny', 'maxDurationMs', 'nodes']);
  if (!['single-agent-v1', 'finite-workflow-v1'].includes(runtime.adapter)) reject('不支持的运行适配器');
  if (!Number.isFinite(runtime.maxEstimatedCostCny) || runtime.maxEstimatedCostCny < 0.01 || runtime.maxEstimatedCostCny > 100) reject('预算须在0.01至100 CNY之间');
  if (!Number.isInteger(runtime.maxDurationMs) || runtime.maxDurationMs < 1000 || runtime.maxDurationMs > 600000) reject('运行时限须在1000至600000ms之间');
  for (const binding of ['toolBindings', 'knowledgeBindings', 'memoryBindings']) {
    if (version[binding] && Object.keys(version[binding]).length) reject('当前适配器不接受未实现的工具、知识或记忆绑定');
  }
  validateSchema(version.inputSchema ?? { type: 'object' });
  validateSchema(version.outputSchema ?? { type: 'object' });
  if (runtime.adapter === 'single-agent-v1') {
    if (runtime.nodes !== undefined) reject('单Agent不能包含工作流节点');
    if (typeof version.systemPrompt !== 'string' || !version.systemPrompt.trim() || version.systemPrompt.length > 20000) reject('系统提示须为1至20000字符');
    keys(version.modelConfig, ['provider', 'maxTokens', 'temperature']);
    if (!['qwen', 'deepseek'].includes(version.modelConfig.provider)) reject('模型Provider必须来自已注册网关');
    if (!Number.isInteger(version.modelConfig.maxTokens) || version.modelConfig.maxTokens < 1 || version.modelConfig.maxTokens > 4096) reject('输出Token上限须为1至4096');
    if (!Number.isFinite(version.modelConfig.temperature) || version.modelConfig.temperature < 0 || version.modelConfig.temperature > 2) reject('temperature须在0至2之间');
  } else {
    if (version.modelConfig && Object.keys(version.modelConfig).length) reject('工作流模型由固定子版本配置');
    const nodes = runtime.nodes as WorkflowNode[];
    if (!Array.isArray(nodes) || nodes.length < 1 || nodes.length > 10) reject('工作流须包含1至10个节点');
    const ids = new Map<string, number>();
    nodes.forEach((node, index) => {
      keys(node, ['id', 'agentVersionId', 'versionHash', 'inputFrom', 'next', 'branch']);
      if (!/^[a-z][a-z0-9-]{1,39}$/.test(node.id) || ids.has(node.id)) reject('节点ID必须有效且唯一');
      ids.set(node.id, index);
      if (node.versionHash !== undefined && !/^[0-9a-f]{64}$/.test(node.versionHash)) reject('依赖指纹无效');
      if (typeof node.agentVersionId !== 'string' || !node.agentVersionId || node.agentVersionId.length > 100) reject('节点必须绑定固定Agent版本');
      if (!['input', 'previous'].includes(node.inputFrom) || (index === 0 && node.inputFrom !== 'input')) reject('节点输入映射无效');
      if (node.next !== undefined && node.branch !== undefined) reject('节点不能同时配置顺序和分支');
      if (node.branch) {
        keys(node.branch, ['contains', 'then', 'else']);
        if (typeof node.branch.contains !== 'string' || !node.branch.contains || node.branch.contains.length > 100) reject('分支匹配文本须为1至100字符');
      }
    });
    const reachable = new Set<string>([nodes[0].id]);
    nodes.forEach((node, index) => {
      if (!reachable.has(node.id)) reject('工作流存在无法到达的节点');
      const targets = node.branch ? [node.branch.then, node.branch.else] : node.next === undefined ? [] : [node.next];
      for (const target of targets) {
        const destination = ids.get(target);
        if (destination === undefined || destination <= index) reject('边必须指向后续节点；禁止循环或缺失引用');
        reachable.add(target);
      }
    });
  }
  return runtime;
}

/** Explicit bounded JSON Schema subset. Unsupported keywords are rejected, never silently ignored. */
export function validateSchema(schema: any, depth = 0) {
  if (depth > 6) reject('Schema嵌套不能超过6层');
  keys(schema, ['type', 'properties', 'required', 'additionalProperties', 'maxLength', 'minimum', 'maximum', 'items', 'maxItems', 'enum']);
  if (!['object', 'string', 'number', 'integer', 'boolean', 'array'].includes(schema.type)) reject('不支持的Schema类型');
  const typedKeywords: Record<string, string[]> = { properties: ['object'], required: ['object'], additionalProperties: ['object'], maxLength: ['string'], minimum: ['number', 'integer'], maximum: ['number', 'integer'], items: ['array'], maxItems: ['array'] };
  for (const [keyword, types] of Object.entries(typedKeywords)) if (schema[keyword] !== undefined && !types.includes(schema.type)) reject('Schema关键字与类型不匹配');
  if (schema.required !== undefined && (!Array.isArray(schema.required) || !schema.required.every((key: any) => typeof key === 'string' && Object.hasOwn(schema.properties ?? {}, key)))) reject('required必须引用已定义属性');
  if (schema.additionalProperties !== undefined && typeof schema.additionalProperties !== 'boolean') reject('additionalProperties必须为布尔值');
  if (schema.properties !== undefined) {
    if (schema.type !== 'object' || !object(schema.properties) || Object.keys(schema.properties).length > 30) reject('Schema对象最多30属性');
    Object.values(schema.properties).forEach(child => validateSchema(child, depth + 1));
  }
  if (schema.type === 'array') {
    if (!Number.isInteger(schema.maxItems) || schema.maxItems < 0 || schema.maxItems > 100) reject('数组必须有0至100的maxItems');
    validateSchema(schema.items, depth + 1);
  }
  if (schema.maxLength !== undefined && (!Number.isInteger(schema.maxLength) || schema.maxLength < 0 || schema.maxLength > 20000)) reject('Schema maxLength无效');
  for (const field of ['minimum', 'maximum']) if (schema[field] !== undefined && !Number.isFinite(schema[field])) reject('Schema数值边界无效');
  if (schema.enum !== undefined && (!Array.isArray(schema.enum) || schema.enum.length < 1 || schema.enum.length > 30 || schema.enum.some((v: any) => object(v) || Array.isArray(v)))) reject('Schema enum只支持有界原始值');
}
export function assertSchema(schema: any, value: any, path = '$') {
  validateSchema(schema);
  const valid = schema.type === 'object' ? object(value) : schema.type === 'array' ? Array.isArray(value) : schema.type === 'integer' ? Number.isInteger(value) : typeof value === schema.type;
  if (!valid) reject(`${path} 类型不符合Schema`);
  if (schema.enum && !schema.enum.includes(value)) reject(`${path} 不在枚举内`);
  if (typeof value === 'string' && schema.maxLength !== undefined && value.length > schema.maxLength) reject(`${path} 超长`);
  if (typeof value === 'number' && (!Number.isFinite(value) || value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity))) reject(`${path} 超过数值范围`);
  if (schema.type === 'object') {
    if ((schema.required ?? []).some((key: string) => !Object.hasOwn(value, key))) reject(`${path} 缺少必填属性`);
    for (const key of Object.keys(value)) {
      if (Object.hasOwn(schema.properties ?? {}, key)) assertSchema(schema.properties[key], value[key], `${path}.${key}`);
      else if (schema.additionalProperties === false) reject(`${path} 包含额外属性`);
    }
  }
  if (schema.type === 'array') {
    if (value.length > schema.maxItems) reject(`${path} 数组超长`);
    value.forEach((item: any, index: number) => assertSchema(schema.items, item, `${path}[${index}]`));
  }
}

export class RuntimeCancelledError extends Error {}
