# 平台能力恢复与 Trace 排障计划

2026-11-09 建立，2026-11-10 续验。基线 `agent-lab` / `4e33101aca32582caf372690c6fe5f29466d8b3f`。本轮用户要求：改进 Trace 交互，恢复题库分权、简历上传、URL/文件提取与 RAG。按阶段交付，每阶段完成后等待用户继续；不能把第一阶段称为全部恢复。

## 源码核对与缺口

| 能力 | 当前代码事实 | 尚缺证据/功能 |
| --- | --- | --- |
| Trace 主页面 | `main.tsx` 原 TraceWorkspace 展示 dashboard 的旧 Harness 摘要；真实 Run 是 `/agent-lab/runs`，事件为 `/runs/:id/trace` | 主入口没有真实运行选择、逐事件详情或异常定位 |
| 编排/报告 Trace | `AgentBuilderWorkspace.tsx` 原来是事件字符串列表；`EvaluationRunLinks.tsx` 只有只读摘要 | 详情查看与故障处理分散，需要共享查看器 |
| 简历上传 | `HomePage.uploadResume` 和 `InterviewPage.handleResumeUpload` 仍调用 `ResumeController.uploadResume`；后者解析后写 ResumeRAG，再生成补充题 | Lab 无统一资料入口；本轮尚未对当前部署重验上传/存储。真实后端接收 PDF/MD/TXT，不能凭页面 Word 文案宣称支持 DOCX |
| URL/文件导入 | `QuestionBankController.importQuestionBankUrl/importQuestionBankFile` 仍在；URL 复用安全抓取器，文件复用解析器，最终进入 `QuestionBankService.importQuestions` | 这是“提取/生成面试题”，不是通用文章/文档 RAG 导入；不能只换入口名称冒充恢复 |
| 题库与资料权限 | 现有题库管理接口需要 ADMIN；独立数据治理 WIP 有 collection/grant/version binding 方案，未部署验收 | ADMIN 准入不能替代每份资料的归属与共享授权；仍缺完整 DB/HTTP/浏览器/恢复证据 |

以上为当前代码核对，不表示真实 API 或运行环境本轮全部通过。历史宪法功能清单和旧验收不用于证明当前可用性。

## Phase 1：Trace 排障工作台（当前唯一实施主题）

- 列出真实工作区最近 100 个 Run，按状态/Agent/应用/ID 筛选；支持指定 ID 查看更早记录。
- 共享 RunInspector：版本、应用、输入/输出 Token、调用数、估算费用、耗时、错误原因；可刷新但不重跑。
- 有序事件列表与详情，模型/工具/工作流/检索/生命周期筛选、搜索、首个异常定位；未知数据不补零。
- 模型 Provider/Model、工具/路由元数据、错误、输入/输出可核对。业务内容显式展开；隐藏常见凭据、邮箱、Prompt 和 system message 字段；不提供原始 JSON/配置导出。过滤并非完整 DLP，页面仍只供已获授权的工作区管理员使用。
- 复用现有 ADMIN 与工作区 GET API；不加 API/数据库/模型调用，不发布 Agent，不改变权限或成本门。旧 Harness 摘要保留在评测页面并明确标注。
- 文件：RuntimeTraceWorkspace、RunInspector、trace-diagnostics、trace-workbench.css，连接 main、AgentBuilderWorkspace、EvaluationRunLinks；组件回归与实际浏览器检查。
- 测试：GET-only、精确 Run/版本、403/404/503/超时、筛选/异常定位、迟到响应隔离、凭据过滤、业务内容默认收起、重复/混合归属 Trace 拒绝；相关类型/lint/build/full Web/diff。只读验证不用新模型费用。

## Phase 2：资料入口与分权（待继续）

先完成 `LAB_DATA_GOVERNANCE_WIP.md` 的失败夹具修复和数据库/HTTP/运行时撤权矩阵，再恢复平台资料导航。题目、文章、文档、个人简历独立分类；默认私有；READ/WRITE/授权管理分开；Agent 只消费显式绑定且当前仍可访问的资料。个人简历不自动写进公共题库。保留原题库、用户资料与数据卷，迁移需可回滚并实际验证。

## Phase 3：URL/文件提取与通用 RAG（待继续）

复用现有安全 URL 抓取、解析、网关和向量存储；在已验收的归属/ACL 上增加来源记录、提取预览、分块/索引状态、检索证据和失败恢复。URL 重定向/SSRF/大小/类型校验不能退化；文件类型以解析器实际支持为准。生成面试题与存储原文章分开选择，不能混淆。每步保留来源/资料版本/Run/Trace 与费用证据。外部模型/Embedding 调用先核私有账本和单次/累计上限，未知不算零；合成检索测试不等于真实 RAG 质量通过。

## 交付边界

后续能力尚未完成。默认产品仍为 React/NestJS/Prisma/LangGraph；实验 Python CI 的 Ubuntu/Playwright 环境问题独立保留。永久公网入口、旧 Mac 迁移、广泛语义质量和整体产品验收仍未完成。

后续发现：ControlCenter 顶层目前仍共用 MCP/dashboard/recorded-imports 连接门；本阶段没有改写整套导航容错，不能据此宣称这些服务失败时 Trace 入口也完全独立可用。
