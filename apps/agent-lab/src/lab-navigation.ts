export const LAB_PAGES = {
  overview: { label: '控制中心', title: '控制中心', description: '从编排、运行到评测，找到下一步需要处理的工作。' },
  runtime: { label: '运行编排', title: 'Agent 与工作流编排', description: '配置 Agent、绑定资料与工具，并管理可追踪的运行版本。' },
  mcp: { label: 'MCP 与工具', title: 'MCP 与工具治理', description: '核对当前进程的工具状态，按需检查或重新加载配置。' },
  data: { label: '数据治理', title: '数据治理', description: '以私有集合组织题目、文章与文档，显式管理共享权限。' },
  'question-bank': { label: '题库治理', title: '题库治理', description: '检索和维护业务题目，导入前预览内容与处理结果。' },
  trace: { label: 'Trace', title: 'Trace 运行记录', description: '从运行状态进入事件时间线，追踪模型、工具与失败原因。' },
  evaluation: { label: '评测', title: '评测证据', description: '核对录制报告与工程指标；真实版本质量以对应评测证据为准。' },
  evolution: { label: '自进化', title: '受控自进化', description: '比较版本证据，通过受控评测决定下一次改进。' },
  experiments: { label: '实验', title: '实验比较', description: '对照已有运行，记录假设与可复核的比较结果。' },
  release: { label: '发布', title: '发布决策', description: '基于证据记录人工决定；记录决定不会自动部署服务。' },
  audit: { label: '审计', title: '审计查询', description: '按版本、时间与状态查找已有记录，核对操作与结果。' },
  operations: { label: '操作日志', title: '操作日志', description: '追溯控制面操作的执行人、对象与确认结果。' },
} as const;
export type LabView = keyof typeof LAB_PAGES;
export function readLabView(search: string): LabView {
  const value = new URLSearchParams(search).get('view') ?? '';
  return Object.prototype.hasOwnProperty.call(LAB_PAGES, value) ? value as LabView : 'overview';
}
export function labViewUrl(view: LabView, href: string): string {
  const url = new URL(href);
  url.pathname = '/';
  if (view === 'overview') url.searchParams.delete('view');
  else url.searchParams.set('view', view);
  if (view !== 'trace') url.searchParams.delete('run');
  return `${url.pathname}${url.search}${url.hash}`;
}
