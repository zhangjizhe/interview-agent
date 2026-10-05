# 当前任务

最后更新：2026-10-05

## 任务 ID

LAB-PRICING-EVIDENCE-4

## 目标与范围

建立集中、版本化的 Provider/Model 费率目录，让真实 Token 用量按可追溯费率生成成本证据；未知模型或无效费率必须显式返回不可用，禁止静默套用通用默认价格。统一 Agent Runtime 与会话成本跟踪的定价入口，不改变 Provider 路由、数据库或计费扣款行为。

## 状态

已完成。Agent Runtime 与 Session Cost 已按实际 Provider/Model 使用同一版本化费率目录；未知费率会将成本证据标记为不可用。本机迁移、容器启动、Provider 健康检查及完整工程门禁均通过，尚无真实 Provider 账单样本可供财务对账。

## 验收

单元测试覆盖精确 Provider/Model、输入阶梯、缓存输入、环境覆盖、未知模型、无效配置和账单容差判断；API 71 suites / 523 tests（另 2 suites / 14 tests skipped）、Cache 22、lint、typecheck、build 通过。加性迁移已在本机 PostgreSQL 应用，API 与 Agent Lab 健康运行；提交后推送并核验 `origin/agent-lab`。
