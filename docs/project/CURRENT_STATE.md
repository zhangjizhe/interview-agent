# 当前状态

更新：2026-10-08 · PROVIDER-HEALTH-PROBE-METERING-1

## Agent配置与MCP执行边界（2026-10-09）

自定义单Agent/有限工作流已实现，独立后端29/29、组件7/7、相关API50/50、最终镜像HTTP59/59及Redis/数据库/向量库恢复重跑通过；隔离浏览器创建、运行、Trace、持久化和分支核验通过。尚未更新业务预览和迁移。MCP父服务/子工具即时禁用与协议健康探测已修复，相关24项及无网络容器真实stdio/HTTP initialize/listTools/echo/关闭阻止调用通过，尚需整合镜像回归及界面验收。报告 `docs/ACCEPTANCE-REPORT-2026-10-09-CONFIGURED-RUNTIME.md`。用户授权单次≤0.5CNY、新发布前测试累计≤3CNY；本阶段外部付费调用0，历史未知账单不记零。下一步题库网关计量、浏览器覆盖和真实模型有界评测。整体NOT_ACCEPTED，按用户要求自主连续推进。


## Lab 基础阻断阶段（2026-10-08）

PRODUCT-REACCEPTANCE-1 基础阻断修复完成，整体仍 NOT_ACCEPTED。修复题库空岗位导致400、MCP重载假成功/丢失执行绑定与系统关闭、健康检查及汇总误导。独立测试Agent 8项包含在相关API 42项内；组件6项、type/build/lint与镜像43/43/恢复通过。本机已部署，浏览器题库正确空状态及禁用MCP失败反馈确认。配置路径原本正确，审计误判已撤回。报告 `docs/ACCEPTANCE-REPORT-2026-10-08-LAB-FOUNDATION.md`。用户新增Agent/编排及独立测试范围见 `docs/acceptance/LAB_AGENT_WORKFLOW_CONTRACT.md`；下一阶段完成Agent配置和受控运行，随后编排和整体双证据，不把CRUD/静态画布算交付。外部MCP真实协议、题库计费写入/搜索及完整交互验收未完成；无新付费请求。用户最新指令要求连续推进，不再按阶段等待。

## 全产品重新验收（2026-10-08）

PRODUCT-REACCEPTANCE-1 为当前唯一活动主题。用户要求测试确认后再交付；产品整体 NOT_ACCEPTED。Phase 0 建立34功能合同、673源码模板项（144交互/529展示，全部未验收），要求API/持久化与浏览器独立二次确认，条件/动态/响应式需逐项展开。发现旧产品规格和全流程脚本过时、CI没有浏览器验收门。计划 `docs/acceptance/PRODUCT_REACCEPTANCE_PLAN.md`。按用户最新指令自主连续推进；真实模型测试须核对额度/未知账单并确定新预算，当前无新推理或产品通过声明。

## 新组织管理员控制面修复（2026-10-08）

LAB-FIRST-ADMIN-1：LabDataset 全局版本唯一与组织隔离冲突，dashboard 404 被误导为重新登录。改为组织/版本复合唯一和按组织 upsert，新增重试连接。真实 PG 19/19、Lab 服务 15/15、认证 10/10、相关 lint/type/build 和实际镜像 36/36 通过；隔离恢复演练通过。备份后部署新迁移 18/18，本机 Lab readiness 200，用户浏览器实际显示控制中心及 VALID 数据集。旧测试固定管理员、mock 初始化和未访问 dashboard 导致漏测，见 `docs/ACCEPTANCE-REPORT-2026-10-08-LAB-FIRST-ADMIN.md`。没有改权限/组织归属或调用模型；本次不是所有业务功能的完整验收。

## 权限管理 SOP（2026-10-08）

ADMIN-ACCESS-SOP-1：新增 `docs/ADMIN-ACCESS-SOP.md`，明确部署所有者控制、ADMIN 与私有名单区别、确认式单账号角色操作、旧会话吊销、验证与回滚。已核对现有鉴权代码及脚本语法；未新增权限变更或完整生产演练。当前缺少持久授权审计和管理员授权页面，作为后续主题保留。

## Lab 登录代理修复（2026-10-08）

LAB-AUTH-PROXY-1：Lab nginx 缓存 API 容器旧地址，登录/注册请求 502。复用 Interview 的动态 Docker DNS 配置并重建部署 Lab。镜像 tsc/Vite build、严格 lint、nginx -t 通过；实际 Lab readiness 200、空凭据登录返回 API 结构化 400。用户实际账号登录待刷新重试确认；未读取密码、修改账号/权限/数据库或发起模型调用。

## Provider 启动计量边界（2026-10-08）

移除 API 启动时直接调用 Qwen/DeepSeek `chat()` 的健康探针，避免绕过统一 Gateway、额度与 Usage Ledger 的隐式模型请求。基础 `/api/health/ready` 仍验证 PostgreSQL、Redis 与 migration；业务 Provider 请求仍由 Gateway 先做额度预留。回归 16/16，API lint/typecheck/build 与 Docker 镜像构建通过；修复镜像启动无 Provider 探针，API readiness、Interview、Lab 均 HTTP 200。为本机 readiness 部署了现有加性 migration `20261008010000_evaluation_cancellation`，17/17 migrations 已应用。未做新的模型推理、真实质量评估或账单对账，详见 [修复报告](../ACCEPTANCE-REPORT-2026-10-08-PROVIDER-HEALTH-METERING.md)。

## 真实 API 冒烟（2026-10-08）

用户要求使用真实 API 验证。本机 PostgreSQL、Redis、Qdrant、Milvus/etcd 恢复后，API readiness、Interview 和 Lab 页面均返回 HTTP 200；API 启动探针对 Qwen 与 DeepSeek 发起真实 `ping` 聊天请求（`maxTokens=1`），日志均显示成功。探针直接调用 Provider 并绕过网关 Usage Ledger/成本追踪，实际 usage 与账单金额未知，不能视为零成本。该证据仅为连通性冒烟，不是业务质量 Benchmark 或发布验收。详见 [真实 Provider 冒烟报告](../ACCEPTANCE-REPORT-2026-10-08-REAL-PROVIDER-SMOKE.md)。固定评测续跑仍需核对额度和中断账单并明确新预算。

## 产品与工程

默认 React + NestJS + Prisma + LangGraph 模块化单体；Interview 5173、Lab 5175、API 3001 已在本机 Docker 运行。两端统一暖灰/白/靛蓝风格。评测持久化任务、幂等与失败费用、认证竞态与题库治理已完成工程优化；独立 migration 在 API 就绪前执行。

本轮 API Jest 663、Cache 22、Web/Lab 99、专用 PostgreSQL 18、真实浏览器 24、合成报告浏览器 8 与 Lab 流程通过；lint 0 warning、typecheck/build 通过。隔离 API smoke 28/28，覆盖真实 Milvus 写入和按主键补偿；Redis 故障探针、PostgreSQL 转储相等、Milvus+etcd 与 Qdrant 恢复读回通过。工程结果不代表覆盖率、生产发布或模型质量。

## 真实证据

缓存生命周期已补齐：部署方通过 ANSWER_CACHE_REVISION 显式更新模型别名桶；旧集合保留至少 30 天，维护工具默认只预览，快照及准确 ID 计划校验后才删除。真实 Redis 合成合同 50 检查通过，10 hit / 40 miss、p95 0.427 ms、零 Provider 调用；不表示生产收益。缓存相关 74 项及维护 HTTP 回归 1 项通过。

训练工程闭环已在构建镜像与隔离 PostgreSQL/HTTP 验证：正式证据保存 skillId，10 个并发完成请求仅一条训练记录，完成不改变技能，复测正式证据才更新聚合并保留关联。镜像 26/26，相关 29 项通过。输入是显式合成 fixture、离线评估定义；不证明真实学习提升。

历史测试债务已恢复：5 个文件按实际记忆、HTTP SSE、追问、压缩与离线 Golden 合同重写，无历史路径排除。上下文决策缓存修复前缀碰撞与跨 tier 复用，完整指纹并刷新 LRU。全量 Jest 88 suites / 661 项通过；另 18 项专用 PostgreSQL 已通过。离线 Golden 不作为真实质量门。

评测控制增加 CANCELLED 与合作取消、跨组织/领取竞态及分页公平回归；相关 40 项、专用 PostgreSQL 18 项、双端 99 项与 lint/type/build 通过。运行中取消在样本边界结算，不能撤销已发送 Provider 请求；未知费用不记零。

题库主题增加 DTO 与批量/查询/生成上限，embedding 最多 20 次、并发 2、无隐式重试；先完成向量生成再单次写入。有界 flush 与准确主键补偿，未知持久化返回 503，不宣称 Milvus 事务或费用回滚。相关 12 项、lint/type/build 通过。

退出主题已接入两端服务端吊销并保护并发新登录；后端原子撤销会话，失败保持可重试。认证 13 项、双端 99 项通过，lint/type/build 通过。最终真实镜像将复核 access/refresh 拒绝及其他设备保留。

正式 Agent 1.0.0；候选 1.0.1 DRAFT。12 Case 冻结发布集已审查；首轮缓存污染 36+36 结果无效。隔离基线 FAILED，13/36 成功样本，费用小计 0.069285 CNY，中断费用未知。v4 发布门 REJECT/RG-021；候选未重跑、未发布。Lab 录制报告 APPROVE 是独立 fixture 决定记录，不触发发布。

## 本轮安全收尾

NestJS 11.2.7 / Config 4.0.4、Router 7.18.4 和 mem0ai 定向 uuid 11.1.1 已完成兼容验证。braces 补齐 AST 深度、循环、大小及 parent 链防护，旧补丁红测、新补丁绿测；实际 multipart/SSE 回归 14 项通过。最新本机 API Jest 663、Cache 22、双端 99、专用 PostgreSQL 18、严格 lint/type/build 通过。隔离 API smoke 28/28，Milvus+etcd 与 Qdrant 数据备份恢复后实际读取通过。官方审计 0 critical / 1 high / 0 moderate；唯一 high 无上游修复，CI 保留原始提示并核对补丁与回归。无零漏洞或第三方审计声明。

## 合并与安全

所有开发保留在 agent-lab。用户已要求完成后合并 main；待剩余工程主题和最新 CI 核验后合并。源码合并不能替代真实质量、账单或生产部署验收。

PR #4 已于 2026-10-08 合入 `main`，merge commit `8b2e94c5b8c831fc027024d43f03cff478e5b5a0`；本地 `agent-lab` 已快进同步该提交。Product verification #37 全绿。f1c0cba 的 PostgreSQL socket 探活竞态已改为 TCP readiness；dbff783 的恢复演练发现 Milvus healthz 早于 QueryNode 可读，566e116 加入有界实际查询重试后，远端完整验收通过。安全 high 风险按报告披露，不伪称审计通过或生产发布。

## 入口

- [本版交付报告](../DELIVERY-REPORT-2026-10-08.md)
- [真实评测报告](../ACCEPTANCE-REPORT-2026-10-07-CURATED-REAL-EVALUATION.md)
- [后续任务](TASKS.md) / [交接](THREAD_HANDOFF.md)
- [历史上下文快照](archive/release-readiness-2026-10-08/CURRENT_STATE.md)：保存本轮整理前内容与既有本地补充，旧结论不作当前验收。
