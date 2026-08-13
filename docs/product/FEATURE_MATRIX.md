# Feature Matrix

状态基于当前默认 NestJS + React 路径的仓库审计，不把 `apps/py-api` 视为默认产品能力。

| Feature | User | Problem | Value | Current Status | UI | API | Database | Agent | Test | Security | Cost | Priority | Phase |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 登录、注册、JWT、RBAC | 用户/管理员 | 身份和管理边界 | 基础信任 | KEEP | 已有登录门禁/管理路由 | 已有 auth API | User、role、passwordHash | 无 | API/Web/浏览器验收 | JWT、RBAC、ownership | 低 | P0 | 已有 |
| 简历上传与解析 | 候选人 | 缺少候选人上下文 | 个性化面试入口 | KEEP | 已有上传/确认 | upload/parse/list | Resume 通过向量上下文，未版本化 | 个性化出题 | 真实内容验收 | 格式/大小限制 | 解析与 embedding | P0 | V0.2 |
| 面试 SSE 与报告 | 候选人 | 无真实模拟面试 | 核心 MVP | IMPROVE | InterviewPage/Report | start/message/end | Interview、Message、Report | LangGraph/任务队列 | Jest/E2E | ownership、输入限制 | 会话成本已有 | P0 | V0.2 |
| 结构化 Evaluation | 候选人 | 不知道答得哪里好/差 | 改进依据 | IMPROVE | 报告页已有 | evaluate/generate-report | AnswerHistory、Report | Scoring/Reviewer | Golden Dataset 基础 | 数据隔离 | 模型成本可记录 | P0 | V0.2 |
| Skill Profile 与 Gap | 候选人 | 无法看到长期能力变化 | 训练闭环 | FUTURE | 未有专页 | 未有专用 API | 未有 Skill 模型 | 未来 | 未有 | 需用户隔离 | 低/中 | P1 | V0.3 |
| Adaptive Training | 候选人 | 评估后不知道如何练 | 复面与留存 | FUTURE | 未有 | 未有 | 未有 Training 模型 | 未来 Training Agent | 未有 | 需配额 | 中 | P1 | V0.3 |
| Knowledge Base 与 Question Bank | 管理员/候选人 | 题目与知识缺少治理 | 面试质量 | IMPROVE | QuestionBankPage | 文件/URL/搜索/知识库 API | 向量索引为主 | RAG 检索/题目生成 | 真实导入验收 | SSRF 基础防护、管理员写权限 | embedding/LLM | P0 | V0.4 |
| Knowledge Curator | 管理员 | 来源质量与岗位覆盖不稳定 | 知识智能 | FUTURE | 未有 | 未有 | 未有 Source 生命周期 | 未来受控 Agent | RAG benchmark 可复用 | 注入/版权/SSRF | 抓取与模型成本 | P1 | V0.5 |
| Agent Harness 与 Experiment | 研发团队 | 无法证明 Agent 优化 | 防回归与持续改进 | IMPROVE | 无管理视图 | Golden Dataset/benchmark CLI 已有 | ReflectionLog 已有 | Eval/Reflection/Langfuse 基础 | Golden Dataset、成本基准 | 不自动改生产 Prompt | 必须比较实际 Token | P0 | V0.5 |
| Usage、Quota、Entitlement | SaaS 用户 | AI 成本与滥用风险 | 商业基础 | FUTURE | 未有 | Session cost API 仅基础 | SessionCost 已有 | Gateway 已有 | 成本基准 | 限流已有，Quota 未有 | 高优先级控制项 | P1 | V0.6 |
| Billing 与 Payment | 付费用户 | 订阅和支付 | 商业化 | FUTURE | 未有 | 未有 | 未有 | 无 | 未有 | Webhook/幂等要求 | 高 | P2 | V0.6 |
| Mini Program | 日常训练用户 | 移动碎片化练习 | 扩展触点 | FUTURE | 未有 | 应共享 API | 未有 | 应复用 | 未有 | 统一身份 | 中 | P2 | V0.7 |

## 分类定义

- **KEEP**：已具备并应稳定维护。
- **IMPROVE**：已有基础，应补足闭环、质量或治理。
- **REFACTOR**：当前不安排；须单独设计、收益和回滚。
- **REPLACE**：当前无批准替换项。
- **REMOVE**：当前无批准删除项。
- **FUTURE**：未实现，不得作为已交付能力宣传。
