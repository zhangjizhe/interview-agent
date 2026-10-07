# 当前任务

最后更新：2026-10-08

## 任务 ID

LAB-CURATED-BENCHMARK-6

## 目标与范围

建立首个版本化、脱敏、可人工审查的 Interview Agent 业务场景 Dataset，并提供幂等管理员导入入口。发布评测增加 Dataset 样本上限、显式成本预算和未知费率熔断；随后在固定 Dataset/Evaluator 上执行有界真实基线与候选评测，保存质量、延迟、Token、成本和分层统计证据。不自动发布候选，不使用候选人数据。

## 状态

缓存隔离修复及 v4 发布门工程验证完成。Dataset 已获用户确认并批准；首轮缓存污染结果不采信。隔离后基线完成 13/36 样本、4 个完整 Case 后触发月度额度，终态 FAILED；已核验费用小计 0.069285 CNY，中断费用证据不可用。候选未重跑、未发布，正式评测受运营额度与完整费用核验阻塞。

## 验收

API 73 suites / 545 tests（另 2 suites / 14 tests skipped）、Cache 22、Web 83、lint/typecheck/build、Docker readiness 通过。最终真实 comparison API 为 v4 REJECT/RG-021，不能声明业务质量、非回归或可商用验收通过。详见 `docs/ACCEPTANCE-REPORT-2026-10-07-CURATED-REAL-EVALUATION.md`。

## 后续

先由管理员核对组织本月模型尝试额度及中断费用，再确认新的有界重跑预算；禁止重置账本、绕过额度或重复提交失败任务。普通 Interview 缓存上下文/策略/模型指纹列为独立发布前任务。
