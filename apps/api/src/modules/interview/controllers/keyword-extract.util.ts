/**
 * 从面试题文本里抽取技术关键词（用于 expectedPoints）
 *
 * 用法：EvaluationController + InterviewFlowController 都需要从题目里提取关键词
 * 当 expectedPoints 给 ScoringService 评分。原代码写在 InterviewController 私有方法，
 * 拆 controller 后提到 util 文件避免重复实现。
 *
 * 关键词表覆盖：前端 / 后端 / 数据库 / 分布式 / LLM / 工程化 等常见技术栈。
 */
const TECH_KEYWORDS = [
  // 前端
  'react', 'vue', 'angular', 'javascript', 'typescript', 'css', 'html',
  'redux', 'zustand', 'hook', 'virtual dom', '状态管理', '前端', '全栈',
  // 后端 / 语言
  'node', 'python', 'java', 'go', 'rust',
  // 数据库 / 存储
  'redis', 'mysql', 'postgresql', 'mongodb', 'kafka', '数据库', '缓存',
  // 分布式 / 协议
  '微服务', '分布式', 'rest', 'graphql', 'grpc',
  'http', 'https', 'tcp', 'udp', 'websocket', '并发', '异步', '同步',
  // 基础设施
  'docker', 'kubernetes', 'k8s',
  // AI / 算法
  '算法', '性能', '机器学习', '深度学习', 'transformer', 'llm', '大模型',
  '向量', 'embedding',
  // 工程化
  '工程化', '架构', '设计模式', '依赖注入', '控制反转', 'mvc', 'mvp', 'mvvm',
];

export function extractKeywordsFromQuestion(question: string): string[] {
  const lowerQ = (question || '').toLowerCase();
  return TECH_KEYWORDS.filter((k) => lowerQ.includes(k)).slice(0, 5);
}