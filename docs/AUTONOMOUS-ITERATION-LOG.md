# 自主迭代记录

本文件为本次六 Phase 计划的进度事实来源；只记录已执行内容，不将计划视为交付。

## 2026-09-29 · 基线校正与 P1-1

- 任务：校正文档边界，复用全局 Guard 完成限流配置与认证/SSE 策略。
- 改动文件：docs/agent-lab-status.md、docs/project/ACTIVE_TASK.md、package.json、apps/api/package.json、pnpm-lock.yaml、eslint.config.mjs、.env.example、apps/api/src/infra/config/configuration.ts、apps/api/src/modules/auth/{auth.module.ts,auth.controller.ts,security-throttler.guard.ts}、apps/api/src/modules/interview/controllers/interview-flow.controller.ts、apps/api/src/common/filters/global-exception.filter.ts。
- 新增测试：rate-limit.security.spec.ts 共 8 条，覆盖窗口单位、默认阈值、环境覆盖、正常请求、超限/错误码/Retry-After、认证限额、IP 隔离、SSE 建连策略；先运行失败测试，再实现。
- 验证：限流测试 8/8；pnpm test、pnpm typecheck、pnpm build 通过。更正：初次误将已启动的 lint 当作通过；复核发现现有 TypeScript lint 指令缺少插件，已在后续校正，最终门禁必须读取完成退出码。
- 依赖：用户明确批准 ESLint 9 与 TypeScript parser 8 开发依赖；没有升级业务依赖。
- 风险：限流存储沿用单实例内存，多实例部署仍需网关统一限流或共享存储；IP 来自 Express req.ip，不信任任意客户端 X-Forwarded-For。SSE 仅限制新请求，不是活跃连接并发上限。
- 待决策：无；Phase 2–6 未开始。已有本地 UI 修改与历史交接文档不混入本项提交。

## 核心执行原则（用户确认，2026-09-29）

- 以工程最佳实践和可商用为目标：安全、数据完整性、可回滚和可验证优先；未验收的能力不宣称已交付。
- 每个任务通过测试/lint/build 后独立提交并推送到 `origin/agent-lab`，核实远端成功；失败不记为完成。
- 每个 Phase 完成后暂停，等待用户明确继续；不跨 Phase 自动执行。

## 2026-09-29 · P1-2 JWT 会话

- 任务：30 分钟 access、7 天一次性 refresh、logout 吊销、密码变更全端下线及旧 token 兼容。
- 改动文件：auth-session.service.ts、auth.service.ts、jwt-auth.guard.ts、auth.controller.ts、auth.module.ts、configuration.ts、.env.example、docs/architecture-decisions.md、docs/runbook.md；同时补齐 ESLint TypeScript 插件以兼容已有注释指令。
- 新增测试：auth-session.security.spec.ts 12 条、jwt-guard.security.spec.ts 3 条、auth.service.spec.ts 新增 2 条；覆盖轮换竞争、剩余 TTL、logout/改密吊销、旧 token、故障拒绝、改密条件更新及 Guard 边界。
- 验证：先验证缺失实现失败，再通过针对性测试；完整 pnpm test、lint、typecheck、build 通过。lint 保留 4 条历史无效禁用注释警告，不做无关代码格式修改。
- 数据库：无 schema 变更，无 migration/db push；未调用真实模型。
- 风险：Redis 认证状态需持久化、不可淘汰；改密锁故障须按 Runbook 恢复。当前客户端没有自动刷新，access 到期重新登录；不宣称浏览器无感续期或完成商用部署验收。

## 2026-09-29 · P1-3 异常信息边界

- 改动文件：apps/api/src/common/filters/global-exception.filter.ts、apps/api/src/__tests__/exception-filter.security.spec.ts。
- 行为：非 HttpException 统一返回 500 与固定消息，普通/SSE/已发头路径一致；服务端保留脱敏堆栈和不含 query 的 path，避免二次写 header。
- 新增测试：6 条，先确认 3 条泄漏回归失败，再验证修复；完整 pnpm test、lint、build 通过。
- 风险：业务 HttpException 仍由调用方保证 message 安全；非本任务控制器中的主动业务错误需在对应任务治理，不声称全库日志已完整脱敏。
- 无 schema、模型调用或前端变更。

## 2026-09-29 · P1-4 题库 SSRF

- 改动文件：external-url.util.ts、question-bank.controller.ts、external-url.security.spec.ts、content-import-regression.spec.ts、docs/runbook.md。
- 行为：HTTPS/凭据检查、所有 DNS 结果公网上界校验、Agent lookup 固定 IP、每跳重新校验、最多 3 跳、10 秒总时限与 2 MiB 上限；原内容提取与明确失败合同保留。
- 新增测试：19 条，涵盖 IPv4/IPv6/映射地址、混合解析、rebinding、私网跳转、跳数上限、正常公网、大小和 URL 凭据；先运行失败用例再实现。
- 验证：针对测试 19/19、typecheck 通过；完整 pnpm test、pnpm lint、pnpm build 退出码均为 0。
- 风险：没有真实外网抓取或 Provider 调用；地址策略保守拒绝过渡 IPv6/保留地址。知识库与其他外部工具不在本项扩展范围。

## 2026-09-29 · P1-5 命令入口策略与 Phase 1 收尾

- 改动：执行器与 Guard 共用白名单，拒绝路径命令、shell 与危险程序；调用方不能覆盖 PATH/解释器启动环境。新增容器沙箱路线图，固化商用与逐迭代推送原则。
- 新增测试：15 条安全回归，覆盖拒绝、允许、配置收缩、空白名单、危险命令及环境注入；先失败再修复。
- 最终验证：pnpm test（API 57 suites / 444 tests、Cache 22、Web 83）、lint、typecheck、build 全部退出码 0；lint 有 4 条历史警告。Phase 1 共新增 65 条测试。
- 安全边界：白名单不能隔离解释器、文件系统或网络；容器 Worker 尚未实现，不能用于不可信多租户执行。
- 数据库/API/成本：无 schema 或迁移；本阶段增加刷新、注销和改密 API，认证增加 Redis 读写；未调用模型，无新增 Provider 成本。
- 未完成验收：真实 Redis 故障/恢复、浏览器刷新闭环、部署与容器隔离；本次没有模型效果变化，Benchmark 不适用。
- Phase 1 代码与本地门禁完成，Phase 2–6 未开始，等待用户继续。原有 UI 等未提交修改保持原状。

## 2026-09-29 · P2-1 多租户模型与资源边界

- 改动：Prisma Organization、业务及附属表 organizationId、加性 migration 与幂等回填脚本；organizations 模块统一查询边界、ADMIN 管理接口；JWT Guard 从数据库解析当前身份；Qdrant/Milvus 集合与知识库缓存按组织隔离。
- 复用：保留已有 user/workspace ownership 与 404；以复合外键限制跨组织关联。组织管理要求 ADMIN 且位于平台管理配置名单，带历史资源的成员转移返回 409。
- 测试：新增 23 条单元回归及 10 条真实 PostgreSQL 隔离回归；覆盖并发上下文、嵌套创建、反向关系计数、跨组织读写、默认组织回填、知识库缓存与集合、管理员权限。先运行缺失策略失败，再实现。
- 验证：空库及合成存量库 Prisma migrate deploy 成功；隔离回归 33/33；完整 pnpm test（API 467、Cache 22、Web 83）、lint、typecheck、build 通过。默认 test 跳过需专用连接的 10 条集成测试，已单独真实执行。首次全量运行因跳过套件仍初始化空连接而失败，修复测试初始化后通过。
- 风险：现有业务数据库未迁移；真实向量库/浏览器验收尚未执行；组织数量增长会增加向量集合资源开销；旧控制面全局唯一版本/Receipt 键仍可能冲突。后台调用必须显式设置组织；迁移后不可直接回退旧 API。
- 数据与成本：无删列或改列类型，无真实模型调用；新组织显式知识导入沿用原 embedding 成本。P2-2 配额任务接续执行，Phase 3 未开始。

## 2026-09-29 · P2-2 月度额度与 Phase 2 收尾

- 改动：Plan 与组织套餐、UsageLedger LLM_CALL 及可空面试关联；新增额度服务、运营配置 API，网关同步/流式/fallback 和 DeepAgents transport 强制记账；题库文本提取复用网关。面试创建与用量同事务，删除不退款。
- 并发/安全：组织行锁保证检查和记账原子性；90% 预警；输入大小/输出 token 上限；额度故障 fail closed。JSON 和 SSE 均保留 QUOTA_EXCEEDED，资源校验在 SSE 头之前执行。
- 测试：先编写额度服务和 transport 失败用例再实现；新增 17 条单元回归及 4 条 PostgreSQL 回归。最终 pnpm test：API 484、Cache 22、Web 83；lint/typecheck/build 均退出码 0，lint 4 条历史警告。14 条需专用数据库的测试默认跳过，已在真实隔离 PostgreSQL 单独全部执行。
- 数据验收：空库和合成存量库 migrate deploy 成功；20 个并发请求/上限 3 恰好 3 次成功、17 次额度拒绝；验证月度与组织独立、删除不退款、创建失败无账单。可复现脚本 scripts/db/verify-phase2.sh。
- 架构/成本：无新增依赖；复用 NestJS、Prisma、UsageLedger 和 SessionCost。按文本调用尝试次数准入，非精确 token 月预算；embedding、工具、启动探测不计入。DeepAgents 工具协议暂保留兼容 transport，详见 ADR 14。
- 未完成：业务数据库未迁移、未部署、未调用真实 Provider，未执行本阶段真实向量/浏览器验收；支付、容器隔离与总费用预算不属于已交付能力。模型效果 Benchmark 不适用，本阶段评价依据为隔离、并发和故障回归。
- Phase 2 代码与本地门禁完成；Phase 3 未开始，等待用户继续。用户原有 UI 等修改未纳入本阶段提交。

## 2026-09-30 · Phase 3 可观测性与本地交付验收

- 范围：用户明确选择先完成原 Phase 3，并要求启动、检查 Interview 与 Lab。自进化闭环保留为下一独立任务，本阶段不调整 Agent 策略。
- 改动文件：metrics 模块与测试、common/logging、main.ts、模型 Provider/DeepAgents transport、限流/配额/SSRF/SSE 计数点、AuthModule 与 HealthController、Docker Compose、infra/observability、setup/verify-observability 脚本、依赖清单/锁文件、环境模板及交接文档。
- 交付：专用凭据保护的 Prometheus 文本指标；固定低基数标签的模型调用/延迟/错误/真实 usage、安全拒绝与 SSE 活跃连接；JSON 日志、Helmet、可选 Prometheus/Grafana profile 和 7 面板 dashboard。
- 实测修复：API 首次启动因局部 JWT Guard 无法注入 AuthSessionService 失败，已补 Nest 模块装配回归并导出服务。浏览器发现 migration 仍用旧镜像、readiness 仅验证 Baseline 而误报健康；已统一 API/migration 镜像并验证全部打包迁移。上述失败均未记为交付。
- 数据库：本阶段无新 schema；停写后备份本机数据库并成功恢复到独立副本，副本迁移通过后实际应用此前三份待执行迁移。备份在忽略目录中保留，不提交个人数据；没有执行 db push。
- 测试：新增 16 条回归，最终 API 68 suites / 500 tests、Cache 22、Web 83；pnpm test/lint/typecheck/build 全部退出码 0，lint 保留 4 条旧警告。14 条专用数据库测试本次默认跳过，Phase 2 已单独验证，不冒充本次执行。
- 本地运行：API healthy，PostgreSQL/Redis/Milvus/Qdrant healthy；Interview 24/24 浏览器检查通过；Lab 合成录制导入、实验比较、人工决策、审计、权限与登录流程通过。Playwright 缺少打包浏览器时复用已安装 Chrome。实际指标鉴权、Helmet、Prometheus target UP、Grafana 7 面板和两端 HTTP 检查全部通过；Compose config/promtool 通过。
- Evaluation/Benchmark：本阶段为故障注入与工程验收，不声称模型质量提升；没有执行真实候选人模型面试或质量 Benchmark，启动沿用已有有界 Provider 健康探测。Lab 用例使用合成录制数据。
- 风险：本机运行的前端包含用户原有未提交 UI 修改，它们未混入本阶段提交；公开生产发布、真实模型面试端到端、分布式指标/日志与完整自进化闭环尚未完成。prom-client 提示后继包，按原计划保持当前版本，未来单独迁移。自由文本日志仍需语义隐私审查。
- Phase 3 已完成本地交付门禁；提交推送至 origin/agent-lab 后暂停，不自动执行 Phase 4。

## 2026-10-08 · LAB-CURATED-BENCHMARK-6 评测缓存隔离

- 实测发现：首轮固定回归集两版术语均满分，但候选全部复用语义答案缓存，比较证据不可信；旧运行保留审计，原 APPROVE 不采信。
- 修复：复用 ALS，在 Lab 评测内部强制绕过答案缓存；同步、流式、并发普通请求边界覆盖测试。v4 发布门要求两版缓存隔离证据，真实 comparison 返回 REJECT/RG-021。
- 验证：先失败再修复；API 545、Cache 22、Web 83、lint/typecheck/build 通过（4 条既有 lint warnings；14 条专用数据库测试默认跳过）。Docker API/migration 构建部署和 readiness 通过。
- Evaluation：用户确认 12 Case、36 样本/版、5 CNY/版后批准 Dataset；隔离重跑阈值 4.99 CNY。基线完成 13 样本后月度额度拒绝，FAILED；已核验费用小计 0.069285 CNY，中断费用未知，候选未启动。失败保护停止后续调用，未重复提交。
- 影响：无新依赖、Schema、migration 或路由；内部运行选项和评测 metrics 增量。Provider Prompt 缓存保留，普通 Interview 答案缓存未调整。
- 未完成：完整可信质量/延迟/费用对比、候选发布及正式商用业务验收。先核对运营额度和中断费用，普通 Interview 缓存上下文指纹作为独立发布前任务。详见本轮交付报告。

## 2026-10-08 · DELIVERY-UI-REFRESH-1 双端新设计

- 用户要求完整项目交付与新设计。本阶段复用现有 React/Tailwind/Lucide，统一暖灰/白色/靛蓝专业工作台，改造 Interview 登录和导航、Lab 表单与状态。
- 真实浏览器发现并修复两处手机 Grid 最小宽度溢出；补 Lab 手机退出入口、输入字号和 Interview 底栏安全区。录制报告决定与真实版本发布门标签分离。
- 验证：Web 83 tests、全工作区 lint/typecheck/build、最终两端 Docker build 通过；30/30 桌面/手机布局检查通过，v4 REJECT/发布禁用成立。排除原有未提交编辑的暂存源码另行通过 Web 83 tests 与两端 build。
- 无新依赖、Schema、API 或付费模型调用，不声明 Agent 质量改善。原有编辑保留；本机镜像含这些编辑，干净版本部署仍需单独核验。
- 完整交付顺序保存至 COMPLETE_DELIVERY_PLAN；本阶段完成后等待用户继续普通 Interview 缓存隔离。真实评测额度与未知中断成本阻碍保留，候选未发布。
