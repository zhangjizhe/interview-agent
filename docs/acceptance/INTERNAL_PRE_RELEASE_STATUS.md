# 当前内部预发布验收仪表

更新：2026-10-22。用途：内部证据复核与缺陷关闭；**整体NOT_ACCEPTED，不批准完整产品交付或生产发布**。

训练动作PR57及POST超时PR58经限定工程验收与最新六项CI成功后合并；当前进入训练GET读取边界，未通过阶段不记交付。见[训练动作证据](TRAINING_ACTIONS_EVIDENCE.md)及[POST超时进度](TRAINING_TIMEOUT_EVIDENCE.md)。限定阶段合并不能替代整体验收。

## 固定事实

| 项目 | 已核实事实 | 不能推断 |
| --- | --- | --- |
| 最近产品基线 | PR58精确`ed90ec6`最新六项作业成功，已合并`e108a685f0839f3ad3c7556bcf8818468784e2ac`；PR/远端main/agent-lab均读回该结果，首轮CI取消保留 | 后续文档提交自动通过，或业务环境已部署 |
| 镜像/部署身份 | 最近产品CI从对应锁定源构建API、Web及Lab镜像；业务目标环境SHA/镜像/迁移尚未核验 | 隔离镜像或main合并等于当前预览/生产部署 |
| 最近完整链 | API93/93、Lab及候选限定隔离浏览器、PG schema/行多集/sequence一致、实际Milvus题目/Qdrant向量payload恢复，exit0 | 真实模型质量、生产RPO/RTO或所有UI状态通过 |
| UI清单 | 990模板：181交互/809展示；990最终NOT_ACCEPTED | 模板数或PARTIAL项等于运行时覆盖率 |
| CI | ci-api已执行隔离浏览器、题目迁移存储合同和恢复链 | 离线fixture证明真实外部协议或模型效果 |
| 费用 | 近期验收外部0；历史已知评测小计0.069285CNY，另有未知费用 | 未知账单为零，或剩余额度已确认 |

## 阶段证据与发布边界

| 能力 | 已有限定证据 | 仍待验收 |
| --- | --- | --- |
| 鉴权/控制面 | 首次组织初始化、实际USER拒绝、伪造本地ADMIN仍403、会话吊销与重登录 | 全认证/角色生命周期、所有错误/移动状态 |
| Agent/有限工作流 | 草稿/固定版本/分支/Trace/幂等/取消；保存启动取消回执、请求关联、上下文锁与历史来源 | 全动态控件、更多故障、工具/知识/记忆生态及真实质量 |
| 题库 | 实际Gateway/Milvus/账本、Strong写入/删除/未知补偿、搜索竞态及浏览器恢复 | 历史16题业务迁入、来源归属、全部状态和真实检索质量 |
| MCP | 运行期开关/真实读回/禁用健康反馈、重载及损坏成功回执恢复 | 重启持久化、多实例协调、外部协议/依赖逐服务可用性和完整执行验收 |
| 操作日志 | 实际重载日志字段/时间/总数、21条20+1页键盘往返、AND空结果/重置恢复；两按钮名称 | 并发分页、读屏、日期、跨组织、自然故障 |
| 评测/发布 | 离线样本/持久任务/发布证据门等工程合同 | 真实固定集质量、可允许发布的真实证据与全部UI |
| Interview/训练 | 原生Response正文超时单测、实际60秒整回执等待/结束删除与PG读回；合成正式证据与PG/HTTP训练复测合同 | 完整简历→岗位→面试/SSE→报告→训练→复测的浏览器及真实模型黄金链 |
| 部署/恢复 | 私有隔离PG及实际向量恢复 | 当前业务SHA/镜像/迁移证明、当场备份、生产部署及恢复 |

## 当前下一执行

TRAINING-READS（I13/I14的GET读取与恢复）：POST限定阶段已合并，读取超时/取消、错误/空状态、仅GET恢复与跨页query隔离已13红测后修复，Web278/build/lint通过；最终实际API93/PG/浏览器/严格恢复exit0，精确CI待完成，见[GET证据](TRAINING_READS_EVIDENCE.md)。现有verify-training-loop直接seed合成正式证据，不是完整候选黄金链；先核start成本，再运行无外部费用的隔离工程验收。真实质量、账单和目标部署仍单独阻断。

## 内部审查顺序

1. 冻结当前候选SHA、对应最新CI、目标环境和实际镜像digest；当前部署对应不明时只复核历史隔离证据。
2. 对照每项产品合同、真实API/持久化证据及独立浏览器记录；没有证据的状态保留NOT_ACCEPTED。
3. 登记失败、未知费用、旧题归属、部署身份及剩余UI状态；不以合成结果代签真实质量。
4. 只有限定阶段验证与精确head全部CI成功，才能经PR合并main；合并仍不是部署或产品发布。
5. 签字仅写“内部预发布证据复核”，记录实际审查时间/人和缺陷，禁止预填正式上线通过。

新模型测试预算单次≤0.5CNY、发布前累计≤3CNY；先核对持久账本、历史未知账单及额度，不盲重放。业务题复制、权限变更和生产写入不能作为测试探针。

## 证据入口

- [完整验收合同/矩阵](PRODUCT_REACCEPTANCE_PLAN.md)、[990项源码模板台账](UI_INVENTORY.json)、[当前待办](../project/TASKS.md)
- [候选请求保护与恢复证据](INTERVIEW_END_TIMEOUT_EVIDENCE.md)及其前置阶段报告；限定范围不提升为I06–I14整行PASS。
- [MCP运行期开关](LAB_MCP_TOGGLE_EVIDENCE.md)、[MCP回执完整性](LAB_MCP_RECEIPT_EVIDENCE.md)
- [运行归属](LAB_START_TARGET_BINDING_EVIDENCE.md)、[请求关联](LAB_START_REQUEST_BINDING_EVIDENCE.md)、[取消回执](LAB_CANCEL_RECEIPT_EVIDENCE.md)
- [题库真实双证据](LAB_QUESTION_EVIDENCE.md)、[题库写入完整性](LAB_QUESTION_WRITE_INTEGRITY_EVIDENCE.md)
- [历史10月10日仪表](PRE_RELEASE_REVIEW_2026-10-10.md)仅保留当时快照，不再作为当前状态。
- [权限SOP](../ADMIN-ACCESS-SOP.md)、[运行手册](../runbook.md)、[完整历史上下文](../project/archive/reacceptance-2026-10-18/CURRENT_STATE.md)
