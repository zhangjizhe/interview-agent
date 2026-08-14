# 项目上下文

最后更新：2026-08-13

## 产品

Interview Agent 是开源 AI 面试训练平台，正从 Agent Engineering 实验场演进为生产应用，并最终具备商业 SaaS 能力。产品结果是可衡量的训练闭环：

```text
简历 + 目标岗位 -> 准备 -> 模拟面试 -> 基于证据的评价
-> 能力缺口 -> 定向训练 -> 再次面试 -> 成长
```

当前产品重点是可靠的面试 MVP 和受控的 Agent Evaluation，而不是堆叠功能。

## 用户

- 使用简历、目标岗位和可选知识进行技术面试准备的候选人。
- 管理题库、知识库和 MCP 配置的管理员。
- 需要可复现 Agent、检索、安全与成本证据的维护者。

## 默认产品路径

默认产品是模块化单体：

- Web：React、Vite、TypeScript、Zustand、TanStack Query。
- API：NestJS、TypeScript、Prisma。
- Agent：LangGraph Multi-Agent Runtime；DeepAgents 和 Direct LLM 为受控降级。
- 数据：PostgreSQL、Redis、Milvus、Qdrant。
- AI：统一 LLM Gateway，Qwen 主用，DeepSeek 备用。
- 运维：Langfuse、Token/Cost Tracking、Docker、Jest、Vitest、Playwright、E2E。

`apps/py-api` 是实验性实现，不能作为默认产品路径的改动依据。

## 核心原则

- Repository 是事实来源；代码优先于过期文档。
- 新增能力前优先复用现有模块与合同。
- 产品是面试训练系统，不是聊天应用。
- 保留鉴权、RBAC、资源归属、输入校验、SSRF 防护和成本控制。
- AI 能力只有进入用户闭环，并通过匹配风险的测试、验收或 Benchmark 后才算完成。
- 单次只处理一个任务范围；范围外发现写入任务列表。
- 禁止提交密钥、凭据、个人数据、本机绝对路径或未脱敏日志。

## 当前阶段

仓库已具备认证后的技术面试 MVP：简历导入、流式面试、报告生成、题库/知识管理、Multi-Agent 编排、检索和验收证据。完整的技能档案、训练计划、额度/计费和商业 SaaS 闭环尚未实现。

## 非目标

- 没有文档化、测试保护的迁移理由时替换 React、NestJS、LangGraph、Prisma 或现有数据存储。
- 将实验性 Python API 提升为主运行时。
- 在前置依赖完成前交付 Billing、Payment、多租户或小程序。
- 从零散聊天体验推断模型、检索或评价质量。
