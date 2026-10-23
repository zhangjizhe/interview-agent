// Shared existing job taxonomy; question attribution must not invent new skills.
export const SKILL_TAXONOMY_VERSION = 'job-keywords-v1';

export const SKILL_TERMS: Array<{ slug: string; name: string; terms: string[] }> = [
  { slug: 'react', name: 'React', terms: ['react', 'react.js', 'reactjs'] },
  { slug: 'typescript', name: 'TypeScript', terms: ['typescript', 'ts 类型'] },
  { slug: 'javascript', name: 'JavaScript', terms: ['javascript', 'es6', 'esnext'] },
  { slug: 'node-js', name: 'Node.js', terms: ['node.js', 'nodejs', 'node'] },
  { slug: 'system-design', name: '系统设计', terms: ['系统设计', '架构设计', '高可用', '分布式'] },
  { slug: 'rag', name: 'RAG', terms: ['rag', '检索增强', '向量检索', '向量数据库'] },
  { slug: 'agent-architecture', name: 'Agent 架构', terms: ['agent', '智能体', 'langgraph', 'multi-agent'] },
  { slug: 'evaluation', name: '评估', terms: ['evaluation', '评估', 'llm-as-a-judge', 'evaluator'] },
  { slug: 'tool-calling', name: '工具调用', terms: ['tool calling', '工具调用', 'mcp'] },
  { slug: 'testing', name: '测试工程', terms: ['测试', 'jest', 'vitest', 'playwright', 'e2e'] },
  { slug: 'database', name: '数据库', terms: ['postgresql', 'mysql', '数据库', 'sql'] },
  { slug: 'redis', name: 'Redis', terms: ['redis', '缓存'] },
];
