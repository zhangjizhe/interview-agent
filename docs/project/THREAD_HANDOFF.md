# Thread handoff

2026-11-10。用户在PR #71合并后要求继续；当前唯一主题LAB-DATA-GOVERNANCE，原暂停候选已经复核并扩充隔离验收。先读LAB_DATA_GOVERNANCE_WIP.md和docs/architecture/LAB_DATA_GOVERNANCE.md。

当前agent-lab基线3c8f089，与main19e911e同tree；前序PR #71已合并，默认Product各组5绿。新资料治理源码尚未提交/部署，原5175仍题库UX镜像，原API/数据库/全部卷未重启或迁移。

修改包括typed集合/ACL/复合外键/不可变历史与审计、当前身份/修订冲突、版本绑定/派发前重验授权、data.read实际revision/hash、克隆清空单Agent绑定、Lab资料页与选择器。旧Interview题库、历史RAG、评测Dataset仍独立；不提供任意表读写或通用向量RAG。

证据：真实PG新装/旧升级及DB/HTTP42；runtime/registry53；完整API1283通过/47跳过（专用DB另跑）；隔离完整Web385；标签后UI8；types/lint/API与Lab Docker构建通过。封闭API136/136通过，浏览器create/edit/history/reload/binding/一合成调用/持久Trace/archive拒绝与无调用增量通过，截图已视觉检查。专用PG备份恢复通过，严格结构/数据/sequence及版本/授权/审计保留。外层Docker手动等待门在回执文件前已退出，后续恢复未跑，不计通过；完整自动门与精确CI/PR/远端待核。

首次失败保留：旧夹具懒PrismaPromise出ALS已修并保留拒绝断言；首轮全Web的缺新GET夹具已补，旧评测异步用例定向与隔离完整套件通过，根因未知。浏览器先缺捆绑Chrome，后发现select/有值textarea的标签识别问题，已加明确可访问名称。旧失败的合成资料保留，复验用唯一新名称，未删除失败记录制造通过。

候选隔离目录与日志保留本机临时位置；不提交本机绝对路径、私有回执或敏感配置。当前仅资料治理相关WIP纳入候选；认证证据、portfolio三文件、auth档案、旧Mac手册保持原样，禁止全部暂存。无外部模型请求；合成结果非语义质量。

注意原API的KnowledgeBaseBootstrap会启动旧知识导入，可能付费。本轮不可未经成本核验就重启原API或声称本机资料治理已上线。后续原部署需备份/迁移/启动成本门；简历、通用提取RAG、真实质量、全产品NOT_ACCEPTED。当前阶段完成后等待用户继续下一阶段。
