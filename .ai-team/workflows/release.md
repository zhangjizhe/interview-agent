# Release Workflow

## Release Gate

| 维度 | 必须确认 |
| --- | --- |
| Product | 验收标准和目标用户价值已满足 |
| UX | Loading/Empty/Error/Permission/Responsive 已覆盖 |
| Code | 类型检查、构建和模块边界通过 |
| Test | Unit、API/E2E/Browser 覆盖与风险匹配 |
| Security | 无 Critical 漏洞、无权限绕过、无敏感信息 |
| AI Quality | 无评测退化；如适用有 Dataset/Harness 证据 |
| Cost | 最大调用、Token、成本和失败路径可解释 |
| Observability | request/session/agent/usage 追踪足够定位问题 |

## 不可发布条件

- Critical Bug 或 Security Critical。
- Agent Regression 无解释或无批准。
- Quota/权限绕过。
- 无法估算新 AI 能力最大成本。
