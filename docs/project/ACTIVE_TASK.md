# 当前任务

最后更新：2026-10-07

## 任务 ID

LAB-CURATED-BENCHMARK-6

## 目标与范围

建立首个版本化、脱敏、可人工审查的 Interview Agent 业务场景 Dataset，并提供幂等管理员导入入口。发布评测增加 Dataset 样本上限、显式成本预算和未知费率熔断；随后在固定 Dataset/Evaluator 上执行有界真实基线与候选评测，保存质量、延迟、Token、成本和分层统计证据。不自动发布候选，不使用候选人数据。

## 状态

等待管理员人工审查。代码、测试、容器和浏览器导入已完成；`interview-release-v1@1.0.0` 已冻结为 12 Case，状态为 `PENDING`，未启动真实 Provider 评测。已有单 Case 失败探针、当前 1.0.0 与草稿 1.0.1 均保持不变。

## 验收

已通过：固定清单与幂等导入、人工批准门、50 Case 上限、成本/费率熔断、API 73 suites / 538 tests（另 2 suites / 14 tests skipped）、Cache 22、lint/typecheck/build、Docker readiness 和浏览器待审查视图。待管理员批准后运行每版本 36 个样本的真实评测；候选只有通过 `release-gate/v3` 且经管理员发布后才可生效。
