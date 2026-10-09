# 当前变更摘要

更新：2026-10-09。历史流水与既有本地补充[归档](archive/release-readiness-2026-10-08/CHANGELOG.md)。

## PRODUCT-REACCEPTANCE-1

- 发布闭环增加首次单版本门禁UI、并发基线CAS、有效单Agent候选验证并拒绝无效工作流自动候选；最终输出评分/有界Schema与v5历史证据拒绝。API744、组件116、HTTP80及60合成评测样本发布/浏览器导航认证/严格恢复通过，远端待验证，首轮恢复差异根因未知保留。

- 已提交并部署自定义Agent及有限工作流、持久化幂等Run队列、MCP父子执行门与真实协议健康探测；PR #5最新CI全绿。用户授权每2小时验收，合格批次合并main，整体产品保持NOT_ACCEPTED。
- 题库向量/精排统一进入模型网关，新增可空UsageLedger metadata保存无正文费用凭证；保留未知费用，明确无SDK重试。读取/删除须存储成功确认及删除强读。本机隔离API67、浏览器实际Agent/工作流/题库链路及恢复通过；新批次远端CI/业务20迁移尚未完成。

## RELEASE-READINESS-2

## DELIVERY-CLOSEOUT-1（已合并到 main）

- 最终验证收尾：PostgreSQL 专用回归 18 项；API Jest 663、Cache 22、Web/Lab 99；严格 lint/type/build 通过。隔离 API HTTP smoke 28/28，真实 Milvus 写入与准确主键补偿、Redis 故障探针、PostgreSQL 数据转储相等、Milvus+etcd 和 Qdrant 恢复后实际读回通过。CI PostgreSQL socket 探活竞态改为 TCP readiness；Milvus 的 healthz 早于内部 QueryNode 可读，恢复流程以有界实际查询确认就绪。

- Docker Compose 将宿主端口限制到 loopback，Redis 开启 AOF 与 `noeviction`；运行手册归档 Python 替代实现旧记录，并更新恢复演练边界。PR #4 于 2026-10-08 以 merge commit `8b2e94c` 合入 main，agent-lab 已同步。唯一官方 audit high 仍为 braces 无上游修复 advisory；工程合并不等于商业生产发布。

- 训练主题：正式证据保存题目 skillId，训练完成 CAS 幂等、复测单次关联；相关 29 项通过，隔离镜像 HTTP/PG 26/26（含训练链路）通过，不声明真实能力提升。

- 恢复全部 5 份旧设计测试、移除排除规则；完整内容/role/tier 压缩缓存指纹及 LRU 命中刷新。全量 Jest 661 项、严格 lint/type/API build 通过；真实 SSE HTTP 与离线 Golden 分别记录。

- 评测控制：加性 CANCELLED / cancelRequestedAt、ADMIN 工作区取消、样本边界停止及实际费用保留；并发/幂等/分页回归，相关 40 项 / PostgreSQL 18 项、lint/type/build 通过。

- 题库主题：运行时 DTO、嵌套/UTF-8/数量/查询约束；有界 embedding 并发与零隐式重试，准确主键补偿、有界 flush 与未知写入 503；相关 12 项、lint/type/build 通过。

- 退出主题：双端服务端吊销、失败重试与新登录竞态保护，服务端 Lua 原子撤销；认证 13 项、双端 99 项、lint/type/build 通过，镜像 HTTP 验收已扩充。

- 安全主题：NestJS 11 / Config 4、Router 7、定向 uuid 11；braces 补齐 AST/循环/宽度及 parent 防护。红绿复现、真实 multipart/SSE、全量 API 631 / Cache 22 / 双端 95、lint/type/build 通过；上游审计仍有一个由本地补丁修复的 high，新增 CI 完整性与新 advisory 拒绝门。

## 既有交付记录

- 247521d 已推送并建立 Draft PR #4；补充真实测试排除口径和干净源码核验入口，main 安全剩余项不被工程绿灯替代。

- 8067764：评测任务加性迁移、幂等 202 API、资产冻结指纹、原子领取、租约与真实进度；同集比较和未知费用/失败展示。
- d17afec：认证迟到 401 竞态与 Lab 查询清理；ADMIN 题库治理、删除失败语义和搜索状态一致性。
- 本轮收尾：兼容依赖安全升级、braces 有界解析补丁、真实 multipart 回归、三端冻结 Docker、严格产品 CI、日期正确的浏览器证据目录。
- README / 交付报告明确真实数据与 AI 边界，六份历史上下文归档。真实基线仍 FAILED，候选未发布。

早期验证快照：API 626、Cache 22、Web/Lab 95、PostgreSQL 17、真实浏览器 24、合成报告 8。历史数值仅保留上下文；最终数字见交付报告。生产依赖审计仍有 1 high；商业验收未完成。
