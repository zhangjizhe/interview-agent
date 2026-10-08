# 任务交接

更新：2026-10-08 · DELIVERY-CLOSEOUT-1

## 当前结论

本轮已完成安全迁移与 braces AST 防护本地验收，见 ADR 20。API 631 / Cache 22 / 双端 95、lint/type/build 通过；官方审计仍显示唯一无上游修复的 braces high，CI 固定补丁 SHA 并运行回归，不隐藏 advisory。用户要求继续全部工程主题后合并；最新远端/镜像/导航收尾尚未完成。额度只读核验为 100/100，已询问正规新增额度及 ¥10 上限，不重置账本。生产环境目标也待补充。

247521d 已提交推送，远端确认一致；[Draft PR #4](https://github.com/zhangjizhe/interview-agent/pull/4) 已关联本任务。源码验收与远端 CI 是独立证据；当前检查见 PR / Actions，后续安全迁移后必须复验最新提交。默认 Jest 仍排除 5 份旧 spec，已补真实测试口径，不称历史零跳过。

本轮优化与本地全量验证通过，详见[交付报告](../DELIVERY-REPORT-2026-10-08.md)。8067764 为评测任务，d17afec 为认证与题库整合；安全/CI/文档提交随后收尾。全部后续修改在 agent-lab，并按主题验收、提交、推送后核对远端。

main 暂不合并：生产审计仍有 1 high / 6 moderate，braces 本地补丁未获独立风险复核，剩余升级跨主版本。远端 CI 必须读取实际结果，不能用本地通过替代。完成这两项再恢复合并审核；代码合并与 Agent 发布是不同动作。

## 禁止遗忘的边界

- TRAINING-LOOP-1 工程镜像 26/26 通过（含真实 API 与 PostgreSQL 的训练记录/正式聚合），修复正式证据遗漏 skillId 与并发重复完成。数据和分数均为隔离合成 fixture，不是付费评测或候选人成效；默认构建 HTTP CI 每次复验。

- 已移除全部五个历史 Jest 路径排除，重写 21 项真实合同测试，API 全量 661 项通过。SSE 是实际 HTTP / 离线 Agent；Golden 是离线 scorer 合同，不能称付费 Benchmark。专用 PG 18 项单独通过。

- EVALUATION-CONTROL-1：相关 40 项 / PostgreSQL 18 项通过；加性取消迁移须由独立 migration 部署。取消停止后续样本，保留在途租约和实际费用；新键才可明确重跑，不能把合作取消等同零费用或账单结算。

- QUESTION-INPUT-1 本地 12 项通过；批量 20、embedding 并发 2 / 零隐式重试，嵌套 DTO/字节数约束。Milvus 写后故障只在准确 PK 可得时补偿，未知结果 503 且需检查后重试；不保证分布式事务或人民币硬预算。

- 本轮 AUTH-LOGOUT-1 已完成本地验证：两端请求服务端后清会话、失败可重试、迟到成功不清新登录；Lua 原子吊销。最终镜像 HTTP 脚本已加入 access/refresh 复用拒绝及另一设备保留。

- 正式 Agent 1.0.0，候选 1.0.1 DRAFT；v4 REJECT/RG-021。旧 36+36 缓存证据无效。
- 隔离基线 FAILED，13/36 成功样本、小计 ¥0.069285，中断调用费用未知。先核验额度和费用，再确定新预算，不重置账本或盲目重跑。
- 本轮无新付费业务 Benchmark；API 启动健康探测可能产生 Provider 调用。
- 录制 fixture 的 APPROVE 不发布 Agent。30 Case Golden Dataset 与 12 Case 发布集均为合成数据，不代表生产效果。
- `.local-backups/release-20261008/` 为私有备份，Git 忽略，不提交。隔离恢复匹配 schema 和全表行数；不证明向量库/异地灾备。
- 旧失败成本报告及历史截图的原有未提交编辑保留，不纳入本轮主题提交。六份旧上下文连同本地补充已[归档](archive/release-readiness-2026-10-08/THREAD_HANDOFF.md)，当前文件不再累积历史流水。

## 推荐下一主题

[DEPENDENCY-SECURITY-1](TASKS.md)：安全主版本迁移与补丁复核。一次只处理该主题；不自动启动付费评测、发布候选或扩大生产部署范围。
