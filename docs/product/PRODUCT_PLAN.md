# Product Plan

## 双产品定位

Agent Lab 是独立的 Agent 编排与控制平台；Interview 是接入该平台的第一个应用层。

```text
Agent Lab
  -> Runtime / MCP / Trace / Evaluation / Experiment / Release
  -> Interview Application
       -> Candidate Improvement Loop
```

Agent Lab 管理受控的 Agent 工程闭环，不进入候选人导航或面试房间。Interview 继续是面向候选人的训练产品。

## Interview 正式定位

**AI Interview Training Platform**

帮助用户针对目标岗位完成真实模拟面试，通过 AI Evaluation 识别能力差距，并通过个性化训练持续提升。

```text
Resume
-> Target Job
-> Skill Model
-> Knowledge
-> Question Bank
-> Interview
-> Evaluation
-> Skill Gap
-> Training
-> Re-interview
-> Improvement
```

产品核心不是 AI Chat，而是 **Candidate Improvement Loop**。同时建设技术飞轮：

`Agent Trace -> Evaluation -> Harness -> Experiment -> Optimization -> Better Agent`

## 分阶段计划

| Phase | 主题 | 目标 | 当前依据 |
| --- | --- | --- | --- |
| 0 | Independent Open Source Agent Lab | 作为独立控制台和平台验证 Agent、RAG、工具、评测、追踪和实验能力 | 首个独立 `apps/agent-lab` 控制台；现有 LangGraph、RAG、MCP、Golden Dataset、Reflection、Langfuse |
| 1 | AI Interview MVP | 用户完成第一次完整 AI 面试 | 已有 Resume、Question、Interview、SSE、Report；需产品化收口 |
| 2 | Personal Skill System | 建立 Skill Profile、Skill Gap、Skill Trend | 未来，当前仅有评分与答题历史 |
| 3 | Adaptive Training | 从评估形成训练与复面闭环 | 未来 |
| 4 | Knowledge + Question Intelligence | 多来源知识、质量与题目智能 | 已有文件/URL/题库/RAG；需来源模型与生命周期 |
| 5 | AI Question Curator | 搜索、收集、排序、去重、生成、评测和质量门 | 未来，必须人工批准写入 |
| 6 | Agent Self-Improvement | Trace、失败分析、Dataset、Harness、Experiment | 已有基础资产，待统一治理 |
| 7 | SaaS | Auth、Quota、Usage、Billing、Abuse Prevention | Auth/Usage 基础存在；Quota/Billing 未实现 |
| 8 | Web + Mini Program | Web 深度训练，小程序日常练习 | 未来 |
| 9 | Production AI Interview Training Platform | 形成可衡量能力提升的产品 | 长期目标 |
