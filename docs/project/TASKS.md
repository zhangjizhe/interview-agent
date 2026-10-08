# 任务列表

更新：2026-10-08。保持一个活动任务；旧任务细节保存在[归档](archive/release-readiness-2026-10-08/TASKS.md)，归档中的过期阻塞与完成声明不得直接复用。

| 优先级 | 任务 | 状态与验收条件 |
| --- | --- | --- |
| 当前 | RELEASE-READINESS-2 | 本地优化与整体验证完成；提交推送、远端 CI 与 main 合并结论收尾。真实质量与商用发布不记完成 |
| P0 | DEPENDENCY-SECURITY-1 | braces 本地补丁独立复核；NestJS / file-type / Router / uuid 安全迁移，实际上传/SSE/导航/SDK 回归，重新审计。未批准风险豁免 |
| P0 | LAB-CURATED-BENCHMARK-6 | 额度失败与中断费用阻塞。核对额度/费用和新有界预算后才能续跑；同集真实隔离评测与人工审查后决定候选发布 |
| P0 | PRODUCTION-ACCEPTANCE-1 | TLS、凭据/端口/网络隔离、备份与向量恢复、容量、监控和故障演练；工程 CI 不替代生产验收 |
| P1 | TRAINING-LOOP-1 | 训练 → 再面试 → 可比正式技能证据；实际 API/浏览器与真实样本核验。现有 fixture 与入口不是提升证明 |
| P1 | AUTH-LOGOUT-1 | 两端退出调用服务端吊销，验证并发会话及令牌复用拒绝；当前客户端退出只清本地会话 |
| P1 | QUESTION-INPUT-1 | 题库参数 DTO、批量数量/成本上限与失败回滚合同，复用 ADMIN/检索边界 |
| P1 | EVALUATION-CONTROL-1 | 任务取消、规模化公平调度与精确中断结算；保持禁止自动付费重放 |
| P2 | CACHE-LIFECYCLE-1 | 旧 Qdrant 答案保留/清理策略、旧 benchmark 合同适配、模型别名更新治理与真实费用/延迟对比 |

已完成工程主题：双端视觉更新、完整请求答案缓存、Lab 缓存隔离/v4 门、评测任务、认证/题库整合、兼容依赖与 CI。完成工程主题不代表对应 AI 业务效果、生产验收或全部路线图完成。
