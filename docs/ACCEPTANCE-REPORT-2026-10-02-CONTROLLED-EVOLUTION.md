# Agent Lab 受控自进化首版验收报告

日期：2026-10-02
分支：`agent-lab`

## 交付范围

- 从当前已发布 AgentVersion 的失败评测中提取固定失败分类，生成确定性、受限的草稿候选；不复制失败消息、候选人原文或自由文本证据。
- 草稿版本只允许由 Agent Lab 评测服务显式运行，普通运行入口仍要求 `PUBLISHED`。
- 对候选与当前版本执行同一 Dataset/Evaluator 对比；发布门要求全部 Case 通过、分数至少 90/100 且不低于当前版本基线。
- 管理员显式发布后才更新 `Agent.currentVersionId`。Interview 每轮只读取当前 `PUBLISHED` 版本，并把其有界策略加入真实提示词链路。
- 独立 Agent Lab 新增“自进化”工作区，可注册 Interview Agent、配置 Dataset/Evaluator/Case、运行基线与候选评测、查看同集对比并执行人工发布。

本阶段复用现有 AgentVersion、AgentEvaluationRun、EvaluationResult 与 Decision Ledger，没有新增表或数据库迁移，也没有引入依赖。

## 安全、成本与发布边界

- 所有新增 HTTP 入口继续由 `ADMIN` RBAC 保护，并按个人 Workspace 查询 Agent 与评测证据。
- 候选生成只使用服务端固定策略映射；未知失败分类进入固定保守策略，不把失败消息拼入 Prompt。
- 候选生成、比较和发布门本身不调用模型。只有管理员显式点击评测时才产生模型调用。
- 本次真实验收运行了三个单 Case：通过基线、失败基线、失败候选。独立 Lab Run 当前没有可靠 Token/费用回传，因此不能把本次结果作为成本 Benchmark。
- 失败探针的候选与基线均为 0 分且存在失败 Case，同集比较返回 `REJECT`，管理员发布按钮禁用；Interview 仍保持 `1.0.0`。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| API Jest | 69 suites / 510 passed，14 skipped |
| Cache/JSON unit | 22 passed |
| Interview Web Vitest | 15 files / 83 passed |
| 受控进化定向测试 | 7 suites / 37 passed |
| Root lint | 0 errors；4 条既有 unused-disable warnings |
| Root typecheck | API、Agent Lab、Interview Web 全部通过 |
| Root build | API、Agent Lab、Interview Web 全部通过 |
| Docker | migration 正常退出；API healthy；Agent Lab 运行于 `http://localhost:5175/` |
| 浏览器 | 管理员登录、Agent 注册、评测资产创建、100 分基线、0 分失败分析、`1.0.1` 草稿生成、草稿评测、同集 `REJECT` 与发布禁用全部通过；console 0 error/warning |

## 限制与后续

- 目前是确定性失败分类到策略的首版，不使用 LLM 自动改写 Prompt，也不宣称候选质量已经提升。
- 发布门比较质量分数和 Case 通过情况；独立 Run 的可靠 Token、费用与稳定延迟基线尚未接入候选比较。
- 下一步应为真实业务 Dataset 建立版本冻结、代表性 Case 和重复运行统计，再扩展延迟/成本非回归门；在有统计证据前不得自动发布。
