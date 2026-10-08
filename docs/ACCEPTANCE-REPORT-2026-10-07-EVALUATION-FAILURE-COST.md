# 发布评测失败成本保护交付报告

日期：2026-10-07

任务：`LAB-CURATED-BENCHMARK-6`，分支：`agent-lab`

## 本轮完成

核验发现：发布评测的运行异常可能发生在部分付费调用之后，原逻辑仍会继续下一样本，且预算不包含失败样本的未知费用。本轮修复后，3–5 次发布评测遇到样本异常、缺失成本、负数或非有限成本时立即停止后续调用，整体记录为 `FAILED`，无法进入发布比较。

失败预算记录 `costEvidenceStatus: unavailable`、`interruptedRunId`、已完成样本数和已核验费用小计。小计不代表包含失败调用的完整账单；中断运行及其 Trace 仍保留。1–2 次探索评测继续沿用已有错误收集方式。

## 验证

- 定向评测服务测试：18 passed，覆盖正常预算停止、运行异常以及三类无效成本。
- API 全量：73 suites / 542 tests passed；2 suites / 14 tests skipped，未把跳过项算作通过。
- lint：0 errors、4 条既有 warnings；全工作区 typecheck/build 通过。
- API 官方 Dockerfile 构建成功，migration 正常完成，API 已更新启动；readiness 的 PostgreSQL、Redis、migration 均为 `ok`。
- Lab 与 Interview 容器继续运行；Lab 界面确认批准前基线和候选评测均禁用。此轮未重做 Interview 全流程验收。
- 数据库只读核验：12 个 Case，已冻结，审查 `PENDING`；评测运行总数仍为 5。
- Dataset 指纹：`sha256:2b7afcec3f242506a3f12915630121fe5795903f18382ef842cae31be6bfc39a`。

## 影响与边界

- 修改：`evaluation.service.ts`、对应测试、发布门合同及项目交接文档。
- 架构：复用原有评测服务、Run 与 Trace；无新模块或依赖。
- 数据库/API/UI：无 Schema、migration、路由或界面变化；失败 metrics 增加中断费用证据。
- 安全：保留 ADMIN、Workspace 归属及 Dataset 人工审查门，没有新增数据读取范围。
- 成本：异常后停止，避免批量放大未知费用；仍是软停止机制，无法撤销已发出的调用，不能声明财务硬上限或账单对账完成。
- Evaluation/Benchmark：确定性失败路径测试通过；未执行真实批量评测，未声明模型质量或自进化效果提升。

## 未完成与下一步

按 `docs/project/DECISIONS.md` 的人工审查决策，等待用户明确批准固定 12 Case Dataset，再执行每版本 36 样本的真实基线与候选评测；每版本默认 5 CNY 停止阈值。比较结果与人工发布是后续独立步骤，不自动启用草稿。

本轮是评测成本保护的本地交付，不代表整个项目已经通过商业生产发布验收。生产部署、真实质量对比和 Provider 账单证据仍未完成。
