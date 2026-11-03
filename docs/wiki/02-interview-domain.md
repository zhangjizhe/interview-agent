# 02 · Interview 业务域

> 代码位置：`apps/api/src/modules/interview/`（46 个文件，7 个控制器，路由前缀 `interview` / `hitl` / `tools` / `admin/mcp-servers`）

这一篇讲「候选人点进去到拿到报告」发生了什么，以及每一步落到了哪张表、哪个接口。

## 1. 主流程

```
① 登录             POST /api/auth/login
② 设目标岗位        POST /api/interview/target-jobs → .../:id/activate
③ 上传/解析简历     POST /api/interview/upload-resume · /parse-resume
④ 开始面试          POST /api/interview/start
⑤ 答题（流式）      POST /api/interview/:id/message  ── SSE 逐字返回
   或取下一题        POST /api/interview/:id/next-question
⑥ 断线/刷新         GET  /api/interview/:id/checkpoint → POST /:id/confirm-resume
⑦ 结束             POST /api/interview/:id/end
⑧ 生成报告          POST /api/interview/:id/generate-report
⑨ 训练建议          GET  /api/interview/training-recommendations
                    POST /api/interview/training-recommendations/:id/complete
⑩ 查看证据          GET  /api/interview/:id/evidence
                    GET  /api/interview/:id/evaluation-runs
```

## 2. 分段说明

### 2.1 目标岗位与技能画像（`skill-profile.controller.ts`）

不是「填个岗位名」这么简单，而是**目标岗位 → 技能项 → 就绪度 → 训练建议**的链条：

| 接口 | 作用 |
| --- | --- |
| `POST/PATCH/GET target-jobs` | 目标岗位 CRUD |
| `POST target-jobs/:id/activate` | 激活为当前目标（单活跃） |
| `GET target-jobs/:id/readiness` | 就绪度：技能缺口 + 面试表现汇总 |
| `GET skills` | 技能字典 |
| `POST target-jobs/:id/training-recommendations/refresh` | 重算训练建议 |
| `GET training-recommendations` / `POST .../:id/complete` | 拉取与完成 |

对应表：`TargetJob`、`SkillDefinition`、`Application`（岗位投递上下文）。

### 2.2 简历（`resume.controller.ts`）

- `upload-resume`：multipart 上传 + 落库
- `parse-resume`：解析成结构化字段（存在安全与体积边界，见 `TASKS.md` 中「简历上传、HITL、多页面实例共享 store 等异步/错误边界」一项）
- `resumes/:userId`：按用户查历史简历

### 2.3 面试生命周期（`interview-lifecycle.controller.ts`）

| 接口 | 语义 |
| --- | --- |
| `POST start` | 创建会话（受月度额度 `QUOTA_MONTHLY_INTERVIEW_LIMIT` 约束） |
| `POST :id/message` | 提交回答并触发 Agent（**SSE 流式**） |
| `POST :id/next-question` | 跳过/取下一题 |
| `GET :id/checkpoint` | 断点快照（刷新、换端、崩溃恢复） |
| `POST :id/confirm-resume` | 用快照恢复会话 |
| `POST :id/end` | 收尾，结算成本、收口未回答问题 |
| `GET list / stats / empty-rooms` | 列表、统计、空房间清理依据 |
| `GET memories/:userId` | 该用户被记住的内容（可见性，用户应能查） |
| `DELETE :id` | 删除会话 |

**断点恢复**是一处容易改坏的逻辑：`checkpoint` + `confirm-resume` 成对存在，且「恢复后的问题必须是**持久化过的那一版问题**」——这就是近期提交 `bind answers to persisted question presentations` 在修的东西。

### 2.4 题库（`question-bank.controller.ts`）

关键是**双轨制**（近期提交 `separate canonical question catalog from retrieval index`）：

| 概念 | 是什么 | 接口 |
| --- | --- | --- |
| **Canonical Catalog** | 权威题目目录（内容、来源、版本） | `catalog/status`、`catalog/adopt-legacy`、`catalog/rebuild-index` |
| **Retrieval Index** | 向量索引，供检索召回 | `search`（向量/混合检索） |

两者分离的原因：改 index 不该改内容，改内容不该依赖索引重建。`rebuild-index` 是显式的、可审计的动作，而不是隐式副作用。

其他接口：`POST question-bank`（单条）、`batch`（批量）、`import-file`、`import-url`、`generate-questions`、`:id/generate-dynamic-questions`（按会话动态出题）、`DELETE :question-id`。

### 2.5 评估与报告（`evaluation.controller.ts`）

| 接口 | 作用 |
| --- | --- |
| `POST evaluate-answer` | 对单条回答打分 |
| `POST :id/evaluate-answer` | 会话内对某题评估 |
| `POST :id/generate-report` | 生成整份报告 |

表：`Report`、`EvaluationResult`、`AgentEvaluationRun`。注意**报告呈现**在验收上分了两条线：真实 API 产出的报告 vs 合成 fixture 验证的呈现（README 明说"报告呈现另有合成 fixture 验证"）。

### 2.6 人在环（`hitl.controller.ts`）

| 接口 | 作用 |
| --- | --- |
| `GET pending/:interviewId` / `GET all` | 待审列表 |
| `POST approve/:interviewId` / `reject/:interviewId` | 通过/驳回 |
| `GET graph-status/:interviewId` | 图当前停在哪 |
| `POST graph-resume/:interviewId` | 用 `Command({ resume })` 恢复图 |

对应 Agent 的 `interrupt()`（见 [03](./03-agent-runtime.md)）。HITL 不是"可选装饰"——图会在 `hitl_review` 节点真的停住，不 resume 就不前进。

## 3. 领域数据（与面试直接相关的表）

| 表 | 用途 |
| --- | --- |
| `Interview` | 会话主体（岗位、状态、时间） |
| `Message` | 逐条对话 |
| `InterviewQuestionPresentation` | **问题呈现快照**——回答必须绑定到这一版 |
| `AnswerHistory` | 回答历史与版本 |
| `Report` | 报告 |
| `TargetJob` / `SkillDefinition` | 目标岗位与技能 |
| `Application` / `ApplicationRun` | 投递上下文与运行 |
| `SessionCost` / `UsageLedger` | 会话成本与用量账本 |
| `DecisionRecord` / `FactAssertion` / `DecisionEvidence` | 判定、事实断言与证据链 |
| `ToolApproval` / `UserToolPreference` | 工具授权与偏好 |

## 4. 四层记忆在业务里的落点

| 层 | 存什么 | 用在哪 |
| --- | --- | --- |
| Postgres | 会话、消息、报告、断言 | 主数据，可审计 |
| Redis | 会话态、额度、精确答案缓存（`REDIS_SESSION_TTL`） | 低延迟读写 |
| Qdrant / Milvus | 题库、知识库、历史对话向量 | 检索召回、跨会话回忆 |
| Mem0（`MEM0_*`） | 抽取出的用户事实/偏好 | 跨会话个性化；`memories/:userId` 让用户可查 |

## 5. 改业务功能时的注意点

1. **别绕过额度**：凡是会触发模型调用的入口，都要走 `LlmGatewayService`，它会做额度预留与记账。直接 `new OpenAI()` 会绕过额度、缓存和计价证据。
2. **别绕过租户**：`requireTenant()` 是缓存与账本的安全边界，新增 Service 里如果手搓 userId 会导致跨租户命中。
3. **回答必须绑 presentation**：新加"重问/换题/续答"类功能时，先确认 `InterviewQuestionPresentation` 是否已落库，否则会出现"答案对不上题"。
4. **报告生成有成本**：`generate-report` 会多次调用模型，改动时注意 `AGENT_LAB_MAX_EVALUATION_COST_CNY` 之类的预算边界不被绕过。
5. **SSE 不能事后补**：`message` 走流式，一旦首字已发出，就不能静默换 Provider 重放（网关用 `hasEmitted` 守住，见 [04](./04-llm-gateway.md)）。

---

[← 返回索引](./Home.md)　|　上一篇：[01 架构](./01-architecture.md)　|　下一篇：[03 · Agent 运行时](./03-agent-runtime.md)
