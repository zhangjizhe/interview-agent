# User Journey

## 目标用户主流程

```text
注册
-> Onboarding
-> 上传 Resume
-> 输入 JD
-> Job Analysis
-> Skill Map
-> 开始 Interview
-> AI Interviewer
-> Follow-up
-> Evaluation
-> Skill Profile
-> Skill Gap
-> Training Plan
-> Training
-> Re-interview
-> Skill Improvement
```

## 旅程状态

| 用户状态 | 当前可用能力 | 产品下一步 | 未来补齐 |
| --- | --- | --- | --- |
| 第一次用户 | 注册、上传简历、创建面试、确认简历、SSE 面试、报告 | 完成第一次面试 | Onboarding、JD、Job Analysis |
| 回访用户 | 登录、查看历史面试与报告 | 基于上次不足再次面试 | Skill Trend、训练计划、复面推荐 |
| 付费用户 | 当前无付费能力 | 不承诺权益 | Quota、Entitlement、Subscription |
| Quota 用尽用户 | 当前无统一 Quota | 不应伪造受限状态 | Usage Ledger、Quota、升级路径 |
| 异常用户 | 登录门禁、错误提示、部分文件/URL 校验 | 解释失败并提供恢复路径 | 统一 Job 状态、重试和支持流程 |

## UX 要求

- 第一次用户不应研究产品使用方法，应被引导到上传简历和开始面试。
- 面试过程展示进度、当前上下文和下一步；不得轻易泄露参考答案或实时评分。
- 评估完成后必须解释证据、弱点和下一步行动，而不是只显示一个总分。
