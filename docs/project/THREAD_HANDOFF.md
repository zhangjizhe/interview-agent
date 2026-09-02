# 任务交接

最后更新：2026-09-02

## 上一任务

TASK-028：Agent Lab 操作日志查询

## 已完成

- 新增 `LabOperationLog`，仅保存管理员 ID、固定动作、固定对象、结果和时间。
- Receipt 提交/导入、Experiment 创建、人工 Release Decision 和 Retention 请求均记录成功或拒绝，不保存原始请求、异常、候选人内容、Prompt 或凭据。
- 管理员可通过白名单枚举筛选与分页只读查询操作日志；普通用户 API 请求被拒绝。
- 新增独立 Agent Lab 操作日志视图和浏览器验收。

## 验证

- API typecheck/build 通过。
- API Jest：32 suites / 276 tests 通过。
- Golden Dataset：30 Case 结构校验通过。
- Agent Lab build 通过。
- Docker：API healthy。
- Browser：管理员操作日志查询与普通用户拒绝通过。
- Provider：未调用。

## 推荐下一任务

TASK-029：Agent Lab 离线评测调度合同

## 所需上下文

按 `AGENTS.md` 读取核心顺序，再阅读 `docs/agent-lab/CHARTER.md`、`docs/harness/RELEASE_GATE.md`、`apps/api/src/modules/agent-lab/`、Prisma Schema、操作日志合同和控制面浏览器验收。

## 风险

- 调度只能消费录制/mock 输入，不能触发真实 Provider 或绕过已有 Receipt、Experiment 和 Release Decision 边界。
- 调度的暂停、超时和并发控制必须可审计，且不得导致重复 Run 或自动发布。
