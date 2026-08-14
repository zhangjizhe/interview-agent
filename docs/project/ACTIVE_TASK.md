# 当前任务

最后更新：2026-08-14

## 任务 ID

TASK-010

## 目标

为 AI Interview Training Platform 建立以证据、评估和受控 Agent 演进为中心的重构基线，并设计可验证、可回滚的分批迁移路线。

## 状态

进行中

## 范围

- 审计现有 NestJS/React/LangGraph/Prisma 资产、运行时依赖、数据关系和验收覆盖。
- 研究本机 Agent 实验代码中可被产品复用的模式，不复制实验性实现或依赖。
- 定义目标领域边界、数据演进、Agent 运行/评估闭环、迁移批次和每批验收门。
- 验证当前 Docker、API、数据库和 Web 基线，识别迁移前必须修复的阻塞。

## 非目标

- 在未完成设计审查、数据备份和迁移演练前，替换默认 NestJS/React/LangGraph/Prisma 产品路径。
- 直接将外部实验目录的代码或未验证依赖复制进产品。
- 在同一批中混合训练推荐、SSE、额度、支付或多租户迁移。

## 相关文件

- `docs/product/`
- `docs/agent/`
- `docs/harness/`
- `docs/project/ARCHITECTURE_MAP.md`
- `apps/api/src/modules/`
- `apps/api/prisma/schema.prisma`
- `apps/api/src/evals/`
- `apps/web/src/`
- `/Users/zhangjizhe/Desktop/agent-work/`（只读研究来源，具体子目录待确认）

## 验收标准

- 给出可追溯的现状资产与阻塞清单，代码优先于过期文档。
- 给出保留/替换/延后决策，覆盖架构、数据库、API、安全、成本和测试影响。
- 每个迁移批次定义输入、输出、数据库策略、验证门、回滚条件和独立审查责任。
- 当前开发环境的 API、Docker、数据库 Schema 与 Web 基线有可复现验证记录。
- 形成后续单一主题实现任务；只有通过该设计门的批次才能开始改动。

## 已知风险

- 现有本机 PostgreSQL 缺少 Prisma Migration History Baseline；开发环境已获授权通过 `db push` 同步 Schema，但生产迁移仍需审计、备份与受控 Baseline Procedure。
- Agent 实验目录不是默认产品路径，可能缺少鉴权、资源归属、成本限制、评测与回滚能力。
- 当前 CandidateSkillState 尚未由正式评价生产聚合，不能据此生成训练结论。
