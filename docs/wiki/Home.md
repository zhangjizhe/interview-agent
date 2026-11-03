# Wiki · Interview Agent / Agent Lab

> 代码事实基线：`agent-lab` 分支 `51d5c2b`（2026-11-03）
> 适用范围：NestJS 主后端（`apps/api`）为默认产品路径；`apps/py-api` 为实验性替代实现，不在本 wiki 的默认路径内。
>
> 本目录是项目内 wiki 入口。GH Wiki 未启用时以此为准；启用后可用 `gh api import` 同步到 `<owner>/interview-agent.wiki`。

---

## 这套 wiki 怎么用

现有文档已经很密（`README.md`、`docs/*` 下有 30+ 验收报告、`docs/project/TASKS.md` 门禁清单）。本 wiki **不复述它们**，而是做三件事：

1. **把代码地图画清楚**：哪个能力在哪个模块、多少文件、入口在哪，改动前能定位；
2. **把判定标准翻译成工程语言**：证据门、额度、计价这几套机制是怎么落到代码里的；
3. **给下一步开发一条可执行的路**：尤其 GPT 接入的改动面与验收。

| 页面 | 内容 | 什么时候读 |
| --- | --- | --- |
| [01 架构总览](./01-architecture.md) | 模块化单体、apps 布局、运行时拓扑、模块规模 | 第一次进项目 / 要动跨模块改动 |
| [02 Interview 业务](./02-interview-domain.md) | 登录 → 岗位 → 简历 → 流式面试 → 报告 → 训练 | 改业务功能 |
| [03 Agent 运行时](./03-agent-runtime.md) | LangGraph 7 节点图、state、路由、HITL、流式适配 | 改 Agent 行为 |
| [04 LLM 网关](./04-llm-gateway.md) | Provider 抽象、路由降级、两级缓存、额度、计价证据 | 改模型 / 排模型故障 |
| [05 数据与存储](./05-data-and-storage.md) | Prisma 40+ 模型分组、Postgres/Redis/Qdrant/Milvus 分工 | 加表 / 排查数据问题 |
| [06 Agent Lab 与评测](./06-agent-lab.md) | 版本、运行证据、评测任务、发布门、受控进化 | 做评测 / 发布 |
| [07 开发与运维](./07-dev-and-ops.md) | 启动、分支策略、测试分层、CI、排障 | 每天都要用 |
| **[08 GPT 接入方案](./08-gpt-integration.md)** | **新增 provider 的完整改动面 + 验收 + 风险** | **下一步开发** |
| [09 待办与推进顺序](./09-backlog.md) | 与 TASKS.md 门禁对齐的增量任务 | 开工前 |

---

## 一句话定位

**Interview** 是面试训练工作台（候选人视角）；**Agent Lab** 是受控评测与版本治理台（管理员视角）。两者共用一套 Agent Runtime 与 LLM 网关，但**证据边界严格分离**：Lab 的人工 APPROVE 只记录决定，Agent 版本能否作用于 Interview 另受真实发布证据门约束。

## 当前交付状态（来自 README，2026-10-08）

- 本地工程与浏览器验收通过；**真实业务版本对比尚未通过**；生产部署与商用验收未完成。
- 测试实数：API Jest 626 通过、DB 专项 17、缓存单测 22、Web/Lab 组件 95；lint / typecheck / build 通过。
- 受控业务发布集 12 个已审查冻结的合成场景；合成工程基准 30 Cases。
- 隔离基线在 13/36 成功样本后因额度失败，已核验费用小计 ¥0.069285；正式版本 1.0.0，候选 1.0.1 DRAFT。

> 这些数字是**当前实证**，不是承诺。改代码后必须重跑对应验证，见 [07](./07-dev-and-ops.md)。

## 文档关系

```
README.md                       对外概览 + 交付状态（事实源）
docs/project/CURRENT_STATE.md   当前状态
docs/project/TASKS.md           P0/P1 门禁清单（验收口径）
docs/DELIVERY-REPORT-*.md       交付证据
docs/ACCEPTANCE-REPORT-*.md     逐次验收记录（30+）
docs/wiki/*                     ← 本 wiki：代码地图 + 方案
WIKI.md                         2026-06-21 工程审计（历史快照，已被本 wiki 与 README 取代）
```

`WIKI.md` 里的模块行数、接口数（27 个）、py-api 为默认等描述**已过期**——当前 `apps/api` 有 24 个控制器、137 条路由。保留它是因为其中的审计维度仍有参考价值。

## 常用链接

- [README](../../README.md) · [开发入口 AGENTS.md](../../AGENTS.md) · [产品宪章](../PRODUCT_CONSTITUTION.md)
- [可替换 Agent 架构合同](../architecture/REPLACEABLE_AGENT_CONTRACTS.md) · [题库目录合同](../architecture/INTERVIEW_QUESTION_CATALOG.md)
- [Runbook](../runbook.md) · [Testing](../TESTING.md) · [Roadmap](../ROADMAP.md)
- [Agent Lab 章程](../agent-lab/CHARTER.md) · [能力边界](../agent-lab-status.md)
