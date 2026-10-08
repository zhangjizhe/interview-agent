# 任务交接

更新：2026-10-08 · DELIVERY-CLOSEOUT-1

## 新组织管理员控制面修复（2026-10-08）

LAB-FIRST-ADMIN-1：LabDataset 全局版本唯一与组织隔离冲突，dashboard 404 被误导为重新登录。改为组织/版本复合唯一和按组织 upsert，新增重试连接。真实 PG 19/19、Lab 服务 15/15、认证 10/10、相关 lint/type/build 和实际镜像 36/36 通过；隔离恢复演练通过。备份后部署新迁移 18/18，本机 Lab readiness 200，用户浏览器实际显示控制中心及 VALID 数据集。旧测试固定管理员、mock 初始化和未访问 dashboard 导致漏测，见 `docs/ACCEPTANCE-REPORT-2026-10-08-LAB-FIRST-ADMIN.md`。没有改权限/组织归属或调用模型；本次不是所有业务功能的完整验收。

## 权限管理 SOP（2026-10-08）

ADMIN-ACCESS-SOP-1：新增 `docs/ADMIN-ACCESS-SOP.md`，明确部署所有者控制、ADMIN 与私有名单区别、确认式单账号角色操作、旧会话吊销、验证与回滚。已核对现有鉴权代码及脚本语法；未新增权限变更或完整生产演练。当前缺少持久授权审计和管理员授权页面，作为后续主题保留。

## Lab 登录代理修复（2026-10-08）

LAB-AUTH-PROXY-1：Lab nginx 缓存 API 容器旧地址，登录/注册请求 502。复用 Interview 的动态 Docker DNS 配置并重建部署 Lab。镜像 tsc/Vite build、严格 lint、nginx -t 通过；实际 Lab readiness 200、空凭据登录返回 API 结构化 400。用户实际账号登录待刷新重试确认；未读取密码、修改账号/权限/数据库或发起模型调用。

## 当前结论

`PROVIDER-HEALTH-PROBE-METERING-1` 已完成：移除 `LlmHealthBootstrap` 和绕过 Gateway 的 `healthCheckProviders()`；业务模型调用继续由 quota reservation 保护。网关回归 16/16，API lint/typecheck/build、Docker build 通过。当前容器健康，API readiness 与 Interview/Lab HTTP 200；启动日志无 Provider probe。部署了既有加性 `20261008010000_evaluation_cancellation` migration，17/17 成功。未新增模型推理、费用或质量评测。报告：`docs/ACCEPTANCE-REPORT-2026-10-08-PROVIDER-HEALTH-METERING.md`。

`REAL-PROVIDER-SMOKE-1` 已完成：恢复本机 Postgres/Redis/Qdrant/Milvus 后，API readiness、Web、Lab 返回 HTTP 200；API 启动探针曾真实调用 Qwen、DeepSeek。该历史探针直接调用 Provider，绕过 Gateway Usage Ledger，实际 token/费用未知，不是零成本或账单对账证据。该探针已由 `PROVIDER-HEALTH-PROBE-METERING-1` 移除。详细结果见 `docs/ACCEPTANCE-REPORT-2026-10-08-REAL-PROVIDER-SMOKE.md`。后续真实推理/评测前先核对额度与中断账单并确认费用上限。

DELIVERY-CLOSEOUT-1 已完成。PR #4 于 2026-10-08 合入 `main`，merge commit `8b2e94c5b8c831fc027024d43f03cff478e5b5a0`；Product verification #37 全绿，`agent-lab` 已快进同步 main。当前本机 API Jest 663 / Cache 22 / 双端 99 / 专用 PostgreSQL 18、lint/type/build 通过；隔离 API smoke 28/28，Milvus+etcd/Qdrant 恢复读回通过。唯一官方 high 是 braces advisory，补丁缓解不等于上游修复或第三方审计。真实 Benchmark、费用和生产环境验收仍未完成，不能将代码合并理解为候选发布。

截至 f1c0cba，安全、退出、题库输入、取消、历史测试、训练与缓存生命周期已按主题提交推送。[PR #4](https://github.com/zhangjizhe/interview-agent/pull/4) 已关联；默认 Jest 已移除全部历史路径排除。当前收尾包含专用 PostgreSQL 18 项及 Milvus/etcd/Qdrant 隔离恢复。

本轮优化与本地全量验证通过，详见[交付报告](../DELIVERY-REPORT-2026-10-08.md)。8067764 为评测任务，d17afec 为认证与题库整合；安全/CI/文档提交随后收尾。所有后续修改继续在 `agent-lab`。566e116 的 Product verification #37 已覆盖并全绿，实际恢复查询的有界重试解决 Milvus QueryNode readiness 竞态。

本轮官方 audit 为 0 critical / 1 high / 0 moderate；唯一 braces advisory 无上游修复，固定 SHA 补丁及真实 SDK 回归已完成。无独立审计声明。推送本地收尾后，等待最新 CI 并执行用户授权的 main 合并；真实质量、账单与生产验收保留未完成边界。

## 禁止遗忘的边界

- TRAINING-LOOP-1 工程镜像 26/26 通过（含真实 API 与 PostgreSQL 的训练记录/正式聚合），修复正式证据遗漏 skillId 与并发重复完成。数据和分数均为隔离合成 fixture，不是付费评测或候选人成效；默认构建 HTTP CI 每次复验。

- 已移除全部五个历史 Jest 路径排除，重写 21 项真实合同测试，API 全量 661 项通过。SSE 是实际 HTTP / 离线 Agent；Golden 是离线 scorer 合同，不能称付费 Benchmark。专用 PG 18 项单独通过。

- EVALUATION-CONTROL-1：相关 40 项 / PostgreSQL 18 项通过；加性取消迁移须由独立 migration 部署。取消停止后续样本，保留在途租约和实际费用；新键才可明确重跑，不能把合作取消等同零费用或账单结算。

- QUESTION-INPUT-1 本地 12 项通过；批量 20、embedding 并发 2 / 零隐式重试，嵌套 DTO/字节数约束。Milvus 写后故障只在准确 PK 可得时补偿，未知结果 503 且需检查后重试；不保证分布式事务或人民币硬预算。

- 本轮 AUTH-LOGOUT-1 已完成本地验证：两端请求服务端后清会话、失败可重试、迟到成功不清新登录；Lua 原子吊销。最终镜像 HTTP 脚本已加入 access/refresh 复用拒绝及另一设备保留。

- 正式 Agent 1.0.0，候选 1.0.1 DRAFT；v4 REJECT/RG-021。旧 36+36 缓存证据无效。
- 隔离基线 FAILED，13/36 成功样本、小计 ¥0.069285，中断调用费用未知。先核验额度和费用，再确定新预算，不重置账本或盲目重跑。
- Provider 启动聊天探针已移除；当前 API 启动不调用模型。此前真实冒烟触发探针的实际 usage/费用仍未知。
- 录制 fixture 的 APPROVE 不发布 Agent。30 Case Golden Dataset 与 12 Case 发布集均为合成数据，不代表生产效果。
- `.local-backups/release-20261008/` 为私有备份，Git 忽略，不提交。隔离恢复匹配 schema 和全表行数；不证明向量库/异地灾备。
- 旧失败成本报告及历史截图的原有未提交编辑保留，不纳入本轮主题提交。六份旧上下文连同本地补充已[归档](archive/release-readiness-2026-10-08/THREAD_HANDOFF.md)，当前文件不再累积历史流水。

## 推荐下一主题

完成真实 Milvus 写入确认、隔离数据恢复与最新 CI。缓存治理工程已完成（相关 74 项、维护工具 1 项、Redis 合成合同 50 检查），详见 CACHE-LIFECYCLE.md；尚无真实费用收益。Docker 服务中途停止已尝试恢复，恢复前不将新镜像检查记为通过。
