# Product Roadmap

| Version | Goal | Features | Dependencies | Success Metrics | Risks |
| --- | --- | --- | --- | --- | --- |
| V0.1 | Independent Agent Lab Foundation | 独立控制台、MCP 治理、LangGraph、RAG、追踪、Golden Dataset | 当前 NestJS 主路径与稳定的管理 API | 可独立构建、可复跑评测与真实验收 | 控制面与业务域耦合、文档口径不一致 |
| V0.2 | AI Interview MVP | Resume、目标岗位、面试、报告产品化闭环 | Auth、RAG、SSE | 首次面试完成率 | 面试状态与产品导航不足 |
| V0.3 | Personal Skill System | Skill Profile、Skill Gap、趋势 | 结构化 Evaluation、历史数据 | 用户可解释能力差距 | 评分一致性不足 |
| V0.4 | Knowledge + Question Intelligence | 来源生命周期、题目质量、岗位覆盖 | RAG、Question Bank、导入安全 | 召回与题目质量达标 | 注入、版权、来源质量 |
| V0.5 | Agent Harness | 实验记录、失败分析、版本比较、人工批准优化 | Golden Dataset、Reflection、Langfuse、成本数据 | 无 Agent 回归发布 | 误把命中率当收益 |
| V0.6 | SaaS Foundation | Usage Ledger、Quota、Entitlement | 统一身份和成本模型 | 无额度绕过 | 过早引入 Billing 复杂度 |
| V0.7 | Web + Mini Program | 深度训练与日常练习双端 | API First、统一 Domain | 复面与留存 | 复制业务逻辑 |
| V1.0 | Training Platform | 完整提升闭环与运营指标 | 前置阶段验证完成 | Skill Improvement、Retention、Conversion | 指标无法证明真实提升 |

## 当前建议顺序

先完成 V0.2 的产品闭环设计与 V0.5 的受控 Harness 设计，再引入 Skill Profile 和 Training。Billing、Payment、小程序和复杂多租户不属于当前第一开发 Epic。
