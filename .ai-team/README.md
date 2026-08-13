# AI 产品研发团队

本目录定义 AI Interview Agent 的虚拟研发团队、交付物和协作顺序。团队服务于“AI Interview Training Platform”，不是让多个 Agent 自由聊天。

## 协作模型

```text
Orchestrator
  -> 专业角色产出可审查 Artifact
  -> 下游角色消费 Artifact
  -> QA + Security + Agent Evaluation
  -> Reviewer
  -> Human Approval
```

| 任务类型 | 最小协作路径 |
| --- | --- |
| 普通 UI 改动 | Product Manager -> UX/UI Designer -> Full-stack Engineer -> QA Engineer -> Reviewer |
| 领域/API 改动 | Product Manager -> Architect -> Full-stack Engineer -> QA Engineer -> Security Engineer -> Reviewer |
| AI/RAG/Prompt 改动 | Product Manager -> Architect -> AI Agent Engineer -> Full-stack Engineer -> QA Engineer -> Security Engineer -> Harness -> Reviewer |
| 架构、权限、成本或生产 Prompt 变更 | 上述流程完成后必须 Human Approval |

## Artifact 约定

- `Product Spec`：问题、目标用户、User Story、验收标准、指标、风险和优先级。
- `UX Spec`：信息架构、用户流程、状态、可访问性和响应式要求。
- `Technical Design`：现状、目标、变更文件、依赖、迁移、风险与回滚。
- `Experiment Record`：假设、基线、数据集、模型/Prompt 版本、质量/延迟/Token/成本结果和结论。
- `Review Decision`：`PASS`、`PASS WITH CHANGES` 或 `REJECT`。

## 强制边界

1. 所有改动先遵守 [项目开发宪法](../docs/PROJECT-CONSTITUTION.md) 和根目录 `AGENTS.md`。
2. 优先复用当前 NestJS、React、LangGraph、RAG、模型网关、鉴权、测试和验收资产。
3. Agent 不可自行修改生产 Prompt、权限、题库、账单或基础设施。
4. AI 优化必须先有基线和 Harness 结果，再经 Human Approval 发布。
5. 发现额外问题要记录到后续工作，不得在没有批准时扩大当前任务范围。
