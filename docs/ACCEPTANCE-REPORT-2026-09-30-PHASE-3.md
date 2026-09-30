# Phase 3 本地交付验收

日期：2026-09-30。范围：可观测性、当前 API 启动及 Interview / Lab 本地浏览器流程。

| 验收 | 结果 |
| --- | --- |
| API Jest | 68 suites / 500 passed；14 个专用数据库用例默认跳过 |
| Cache / Web | 22 / 83 passed |
| lint / typecheck / build | 通过；4 条历史 lint 警告 |
| Docker Compose / promtool | 配置通过 |
| API readiness / 依赖 | healthy；全部镜像迁移已应用 |
| Interview 浏览器 | 24/24，含登录、岗位版本、跨用户拒绝、训练空态和移动端 |
| Lab 浏览器 | 管理员登录、录制导入、实验、人工决策、审计及 USER 拒绝通过 |
| 监控运行 | 8 项检查通过：readiness、Helmet、无凭据拒绝、有效抓取、target UP、Grafana dashboard、两端 HTTP |
| 数据恢复 | 本机数据库备份成功，独立副本恢复并迁移成功；备份仅在忽略目录保留 |

验收过程中修复了 AuthSessionService 模块导出遗漏，以及迁移镜像落后于 API、健康检查只判断旧 Baseline 的问题。最终版本统一镜像并校验全部迁移。

入口：Interview `http://localhost:5173`、Agent Lab `http://localhost:5175`、Grafana `http://localhost:3000`、Prometheus `http://localhost:9090`。后两者只绑定本机 loopback，Grafana 使用本机生成的密码。

复验：按 Runbook 启动；运行 `node scripts/verify-observability.mjs`，以及已有两端浏览器脚本。没有调用模型的浏览器验收不能代表完整 AI 面试质量；实际模型效果、生产上线与自进化自动优化均不在本报告结论内。运行前端包含原有未提交 UI 工作，本次提交不包含这些修改；完整工作区与纯提交版本的范围须区分。
