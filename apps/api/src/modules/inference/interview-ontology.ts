export const INTERVIEW_ONTOLOGY_VERSION = 'interview-ontology/v1';

export type InterviewCapability =
  | 'agent-runtime'
  | 'tool-calling'
  | 'rag'
  | 'evaluation'
  | 'memory'
  | 'observability'
  | 'component-design'
  | 'state-management'
  | 'performance'
  | 'api-design'
  | 'data-consistency'
  | 'distributed-systems'
  | 'algorithms';

const AGENT_CAPABILITIES: InterviewCapability[] = [
  'agent-runtime',
  'tool-calling',
  'rag',
  'evaluation',
  'memory',
  'observability',
];

const CATEGORY_CAPABILITIES: Record<string, InterviewCapability[]> = {
  agent: AGENT_CAPABILITIES,
  frontend: ['component-design', 'state-management', 'performance'],
  backend: ['api-design', 'data-consistency', 'distributed-systems'],
  algorithm: ['algorithms'],
};

const CAPABILITY_KEYWORDS: Array<{
  capability: InterviewCapability;
  keywords: string[];
}> = [
  { capability: 'agent-runtime', keywords: ['agent', '工作流', '编排', 'langgraph', '多智能体'] },
  { capability: 'tool-calling', keywords: ['工具调用', 'function call', 'tool call', 'mcp', '审批'] },
  { capability: 'rag', keywords: ['rag', '检索', '向量', '召回', '重排', '知识库'] },
  { capability: 'evaluation', keywords: ['评测', 'evaluation', 'golden', '基准', '回归'] },
  { capability: 'memory', keywords: ['记忆', 'memory', '上下文', '会话状态'] },
  { capability: 'observability', keywords: ['可观测', 'trace', '链路', '监控', '审计'] },
  { capability: 'component-design', keywords: ['组件', 'react', 'vue', 'hooks'] },
  { capability: 'state-management', keywords: ['状态管理', 'redux', 'zustand', 'state'] },
  { capability: 'performance', keywords: ['性能', '虚拟列表', 'fiber', '渲染'] },
  { capability: 'api-design', keywords: ['api', 'rest', 'graphql', '接口'] },
  { capability: 'data-consistency', keywords: ['事务', '一致性', '数据库', '缓存'] },
  { capability: 'distributed-systems', keywords: ['分布式', '高可用', 'cap', '消息队列'] },
  { capability: 'algorithms', keywords: ['算法', '复杂度', '动态规划', '排序', '图'] },
];

export function categoryForPosition(position: string): string {
  const normalized = position.toLowerCase();
  if (normalized.includes('agent') || normalized.includes('智能体')) return 'agent';
  if (position.includes('前端')) return 'frontend';
  if (position.includes('后端') || position.includes('服务端')) return 'backend';
  if (position.includes('算法') || normalized.includes('ai')) return 'algorithm';
  if (position.includes('测试')) return 'testing';
  return 'agent';
}

export function capabilitiesForQuestion(
  category: string,
  question: string,
): InterviewCapability[] {
  const normalized = question.toLowerCase();
  const matched = CAPABILITY_KEYWORDS
    .filter(({ keywords }) => keywords.some((keyword) => normalized.includes(keyword)))
    .map(({ capability }) => capability);

  return matched.length > 0 ? matched : CATEGORY_CAPABILITIES[category] ?? [];
}

export function requiredCapabilitiesForCategory(category: string): InterviewCapability[] {
  return CATEGORY_CAPABILITIES[category] ?? AGENT_CAPABILITIES;
}
