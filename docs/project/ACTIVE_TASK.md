# 当前任务

最后更新：2026-08-14

## 任务 ID

TASK-011

## 目标

完成重构 B0：冻结可执行验收基线，并在 API 与浏览器之间建立候选人 SSE 事件边界。

## 状态

进行中

## 范围

- 将 JWT 真实登录、候选人训练导航和岗位设置作为可执行浏览器验收入口。
- 候选人 SSE 只接收候选可见事件；内部 Agent、工具、检索、模型和成本事件必须在 API 与 Web 双层拦截。
- 为 Golden Dataset 添加不调用 Provider 的结构校验入口，并记录其不是质量发布门的事实。
- 更新重构程序、任务列表和交接中的 B0 验收结果。

## 非目标

- 数据库 Migration Baseline、Schema 重建、CandidateSkillState 聚合、训练推荐、SSE 断点续传、额度或支付。
- 改变 LangGraph 拓扑、Provider、Prompt、检索和工具执行策略。

## 相关文件

- `apps/api/src/modules/interview/controllers/interview-flow.controller.ts`
- `apps/web/src/hooks/useInterviewStream.ts`
- `apps/web/e2e/auth-real-acceptance.mjs`
- `apps/api/src/evals/`
- `apps/api/package.json`
- `docs/product/REFACTOR_PROGRAM.md`

## 验收标准

- 真实登录浏览器脚本在当前候选人导航下完成登录、岗位创建、用户/管理员隔离和移动端检查。
- SSE 响应与客户端状态中没有候选人不可见事件；错误与完成事件继续可用。
- Golden Dataset 可在无 Provider 的情况下执行结构校验。
- API/Web 测试、类型检查、构建、Docker 健康和 B0 浏览器验收有记录。

## 已知风险

- 真实浏览器验收会创建有界测试账号和岗位数据；必须使用随机标识且不得记录个人数据。
- 本机 Docker Web 镜像需要重建后，生产静态入口才包含当前候选人导航。
