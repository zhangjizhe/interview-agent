# 任务列表

更新：2026-10-08。保持一个活动任务；旧任务细节保存在[归档](archive/release-readiness-2026-10-08/TASKS.md)，归档中的过期阻塞与完成声明不得直接复用。

| 优先级 | 任务 | 状态与验收条件 |
| --- | --- | --- |
| P0 | PRODUCT-REACCEPTANCE-1 | 当前唯一活动任务；Phase 0清单及基础阻断修复完成，独立测试Agent已参与；Agent配置/有限编排及隔离运行阶段通过，MCP执行边界已修复；题库计量、真实模型和完整验收进行中，整体未验收，逐项API/持久化与浏览器二次确认，所有失败/阻塞消除后才交付 |
| 完成 | LAB-FIRST-ADMIN-1 | 修复跨组织 Golden Dataset 初始化 404；PG 19/19、服务 15/15、认证 10/10、实际镜像 36/36/恢复演练通过，迁移部署及用户浏览器控制中心确认 |
| P2 | LAB-BROWSER-COVERAGE-1 | 在独立浏览器 CI 加入新组织注册/授权首次控制台和 API 重建 DNS 恢复；当前真实 PG/镜像 HTTP 已覆盖跨组织初始化 |
| 完成 | ADMIN-ACCESS-SOP-1 | 所有者授权/撤权/吊销与验证 SOP，代码核对和脚本语法检查通过；完整操作演练未执行 |
| P2 | ADMIN-ACCESS-AUDIT-1 | 后续独立设计权限变更持久审计与受控管理入口；现阶段私有运维记录，不能声称已有审计能力 |
| 完成 | LAB-AUTH-PROXY-1 | 修复 nginx 缓存 API 旧地址导致登录 502；动态 Docker DNS，build/lint/nginx 验证通过，Lab readiness 200、登录空请求结构化 400；用户账号重试待确认 |
| 完成 | REAL-PROVIDER-SMOKE-1 | 本机 API readiness 与 Interview/Lab 返回 200；真实 Qwen/DeepSeek 启动探针均成功。探针绕过网关计量，实际用量/费用未知；不代表业务质量验收，见真实 Provider 冒烟报告 |
| 完成 | DELIVERY-CLOSEOUT-1 | PR #4 已于 2026-10-08 合入 main（8b2e94c）；Product verification #37 全绿；agent-lab 已同步主线。真实质量、费用和生产结果边界据实记录 |
| P0 | DEPENDENCY-SECURITY-1 | NestJS/Router/uuid 主版本迁移及 braces 完整输入补丁本地验收通过；API 663 / Cache 22 / 双端 99，audit moderate 0、上游 high 1 有回归缓解；无第三方审计或零漏洞声明 |
| P0 | LAB-CURATED-BENCHMARK-6 | 额度失败与中断费用阻塞。核对额度/费用和新有界预算后才能续跑；同集真实隔离评测与人工审查后决定候选发布 |
| 完成 | PROVIDER-HEALTH-PROBE-METERING-1 | 移除启动时 Provider.chat 探针和未使用直连方法；Gateway quota 先于真实 Provider 请求。回归 16/16、lint/type/build/Docker build、readiness 与两端 HTTP 验收通过，详见修复报告 |
| P0 | PRODUCTION-ACCEPTANCE-1 | TLS、凭据/端口/网络隔离、备份与向量恢复、容量、监控和故障演练；工程 CI 不替代生产验收 |
| P1 | TRAINING-LOOP-1 | 工程闭环完成：正式证据保存 skillId、训练完成 CAS 幂等、复测单次关联；干净隔离 API 26/26 含真实训练 HTTP/PG 聚合通过。相同离线定义的合成证据验证链路，真实候选人提升/付费评测仍不记完成 |
| P1 | AUTH-LOGOUT-1 | 两端服务端吊销、失败重试与新登录竞态已完成；后端 Lua 原子吊销 access/refresh，13 项认证和双端 99 项测试通过。最终镜像增加跨设备令牌复用 HTTP 验收 |
| P1 | QUESTION-INPUT-1 | DTO 字节/嵌套/查询限额、批量 ≤20/embedding 并发 ≤2、零隐式重试，新增 6 项与既有 6 项通过；单次插入与有界 flush，失败按准确主键补偿，无法确认时 503 且禁止假成功。数量/Token 上限不冒充精确人民币预算，最终 Milvus 实测待收尾 |
| P1 | EVALUATION-CONTROL-1 | 工程完成：排队/样本边界取消、并发及组织分页轮转验证；相关 40 项、PostgreSQL 18 项通过。不承诺终止在途调用/退费/账单级结算或高吞吐，全局规模化另立后续任务 |
| P2 | CACHE-LIFECYCLE-1 | 工程完成：Redis v2 benchmark 50 检查、零模型/embedding 调用；operator revision 隔离模型别名更新，旧集合仅预览/快照/准确 ID 计划删除并有真实 HTTP 回归。缓存相关 74 项、维护工具 1 项通过；真实费用和生产命中率未验证 |
| P2 | HISTORICAL-TEST-DEBT-1 | 已恢复 5 份旧 spec，移除全部历史路径排除；按当前合同 21 项通过。上下文缓存改为完整内容/role/tier SHA-256 并刷新 LRU；全量 Jest 88 suites / 661 项通过，另 18 项专用 PG 运行 |

已完成工程主题：双端视觉更新、完整请求答案缓存、Lab 缓存隔离/v4 门、评测任务、认证/题库整合、兼容依赖与 CI。完成工程主题不代表对应 AI 业务效果、生产验收或全部路线图完成。

- 重新验收发现：题库之外知识/记忆服务的直接辅助模型调用需要同级费用与超时审计，属于后续全产品验收条目；未据题库修复宣称已覆盖这些服务。
