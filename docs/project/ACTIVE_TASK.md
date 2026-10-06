# 当前任务

最后更新：2026-10-07

## 任务 ID

LAB-STRATIFIED-SIGNIFICANCE-5

## 目标与范围

为 Agent Lab 发布证据增加业务 Dataset 分层统计和成对非劣效区间。发布评测 Case 使用受限的岗位族、技能和难度标签；评测只保存脱敏的 Case key、分数、通过率与切片摘要。候选与同指纹基线按 Case 成对比较，样本量、切片覆盖或统计证据不足时拒绝发布。复用现有 JSON metadata/metrics，不新增数据库表，不改变自动发布边界。

## 状态

已完成。发布 Dataset 在付费调用前执行分层覆盖检查，评测持久化脱敏切片摘要，`release-gate/v3` 强制成对 95% 非劣效区间和切片回归门。正式 API/Lab 容器健康运行；现有单 Case 冻结数据集按预期被阻断，未执行批量真实 Provider 评测。

## 验收

确定性测试覆盖标签缺失、样本量不足、Case 配对不完整、切片回归、区间非劣效通过/失败，以及既有质量/资源门。API 72 suites / 532 tests（另 2 suites / 14 tests skipped）、Cache 22、lint/typecheck/build 通过；Docker migration/API/Lab 与浏览器门禁展示通过。提交后推送并核验 `origin/agent-lab`。
