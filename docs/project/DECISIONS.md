# 当前决策索引

2026-11-10 资料分权决策：[LAB_DATA_GOVERNANCE](../architecture/LAB_DATA_GOVERNANCE.md)。沿用Workspace/可信组织与Prisma，采用默认私有的typed逻辑集合、显式READ/WRITE和owner授权管理，不为每个Agent复制数据库/表。记录修订和审计禁止UPDATE/DELETE；绑定属于固定Agent版本，资料内容为每次运行实际读取的当前修订。无数据库RLS、通用向量RAG或真实模型质量承诺。原服务未升级，精确CI/交付回执另核。

2026-11-09: keep report drill-through read-only inside the report; do not switch into an editable Agent builder merely to inspect a historical sample. Reuse existing ownership-enforced APIs; show unknown cost/empty Trace/denial explicitly, with raw payloads excluded from recording summaries.

2026-11-06: separate strict professional-quality evaluation from presentation availability. Only typed absent technical notes may yield exact verified facts under the existing verbatim evidence mode; unsafe or malformed output still fails closed. Rank fixed references by retrieved evidence; accept exact deterministic legacy/current snapshots to reconcile paid Runs without replay. No new prompt/model/schema or release-gate bypass.

2026-11-05: add a distinct evidence-guide output role, fixed primary technical references and opt-in JSON transport; keep career facts verbatim, normal release gates and old selector rollback. See ADR in architecture-decisions.md. New contracts do not prove semantic or whole-product quality.

2026-11-04 user correction: ordinary verified-account login now uses username/password directly, without SMTP or a new OTP. Registration, reset/change and first-time legacy claim retain mailbox verification. The previous every-login-code policy below is superseded. Registration checks username availability before mail; occupied IDs and mail503 never create accounts.

Actual new evidence: API auth/session/integration26 and Web auth4 pass; API/Web/Lab types, relevant lint, three frozen-source Docker images and syntax/diff checks pass. Isolated real API/PG/Redis/TLS synthetic browser passed registration, three password-only logins, change/reset/revocation/replay refusal and greeting-fault fallback. Original local Web AND Lab password login passed with ADMIN/profile readback and zero mail requests; occupied registration ID refused before mail. Local images updated, passwords/schema/volumes retained. Full real NetEase registration/recovery remains NOT_ACCEPTED. Previous bf9cf6c six green CI jobs do not certify this new diff; scoped new commit/CI next, PR65 stays draft and main unchanged. No unchanged-condition SMTP retry, OTP bypass or model-quality claim.

## Previous snapshot (login policy superseded above)

2026-11-04 auth decision: preserve JWT/Prisma/Redis and a shared Web/Lab identity. Require purpose-bound mailbox codes for registration/every login/change/reset; never recover an unverified legacy owner to an arbitrary chosen mailbox. An explicitly authorized local operator may verify real mailbox possession and restore the existing identity/organization, revoking sessions; this is not a public API bypass. Keep local mail credentials in encrypted Keychain and runtime memory, outside Git/images/Docker configuration. SMTP errors expose only fixed allowlisted protocol metadata, never raw responses, and bounded setup/I/O deadlines fail closed. Synthetic CI does not establish real delivery or semantic quality. SMTP setup retries are limited to two freshly resolved addresses before message transmission, with the same code/counter and original-hostname TLS checks; ambiguous/later failures are not resent. Daily attempts are validated deployment configuration (default8, range1-20). Real NetEase delivery remains unaccepted; failed sends are preserved.

更新：2026-11-03。完整 ADR 在 [architecture-decisions.md](../architecture-decisions.md)；旧汇总[归档](archive/release-readiness-2026-10-08/DECISIONS.md)。

| 决策 | 当前约束 |
| --- | --- |
| 代码事实原则 | 用户2026-10-19要求必须以代码为准，禁止简略推断与编造；现状定位源码/入口/提交，实测与目标分开，未知明示；官方声明不证明本项目接通 |
| 产品路径 | React + NestJS + Prisma + LangGraph 模块化单体；py-api 为实验替代 |
| 商用原则 | 安全、数据完整、可恢复和验证证据优先；合成/录制/工程结果不冒充真实业务与生产发布 |
| migration / 租户 / 额度 | 独立迁移先于 API，readiness 校验所需迁移；组织范围与原子额度是服务端边界 |
| ADR 16 | Lab 评测绕过答案缓存；v4 拒绝缺隔离证据的旧结果 |
| ADR 17 | 产品缓存完整请求精确匹配，Redis v2；不复用语义近似答案、工具或不完整结果 |
| ADR 18 | 评测持久化、幂等、CAS 租约与真实进度；过期失败且不自动付费重放 |
| ADR 19 | pnpm/锁文件/补丁可追溯；兼容安全升级，不隐瞒剩余审计或自动主版本重构 |
| ADR 20 | 安全主版本迁移保持 Node 20/React 18；braces 全输入本地修复，CI 保留上游 high 并验证补丁/回归，新增 advisory 拒绝 |
| ADR 21 | 取消停止后续样本；在途保持租约、准确费用小计及幂等，不宣称退费/精确账单/高吞吐 |
| Lab Dataset 唯一性 | organizationId/version 复合唯一，按可信租户上下文初始化；不以跨组织共享记录或迁移用户解决 dashboard 初始化冲突 |
| ADR 22 | 版本JSON定义单Agent/有限工作流，复用Run/Trace/Gateway；持久队列幂等/租约/取消、固定依赖指纹、预算与有界Schema；合成不替代质量 |
| 自动推进 | 用户2026-10-08明确要求自行推进，覆盖每Phase等待；必要信息/授权仍需核实 |
| ADR 24 | 用户选择全自建可替换架构；领域/发布事实自有，Runtime/Tools/Retrieval/Memory/Evaluator/Telemetry逐步适配；官方对标不代表已接入；当前仅修回合快照与简历确认 |
| ADR 23 | 首发复用单版本门禁；发布基线CAS；最终输出规则final-output/v1与门禁v5，旧评测拒绝复用；无效工作流自动候选拒绝 |
| 持续验收 | 用户授权每2小时检查；阶段相关测试与最新CI全绿后合并main；仅重要进展/失败/需操作通知；不将源码合并记作整体验收 |
| 辅助模型计量 | 题库embedding/rerank复用Gateway；调用前组织额度预留、调用后无正文费用凭证，usage缺失保持未知；加性可空metadata，不自动重试 |
| 分支 | 开发 agent-lab，验证提交推送并核对远端；main 合并与真实 Agent 发布分别核验 |
| 题库领域与采用 | Interview拥有PG当前题目/历史版本；Lab只提供治理UI，评测集独立。按组织显式维护采用旧Milvus源，原源保留；未采用继续LEGACY，不能自动跨组织复制 |
| 题库索引一致性 | 向量为可重建投影，PG先提交、索引失败SAVED/PENDING；显式最多20项重建，无自动付费重放；当前PG版本/归属/删除过滤后才rerank，迁移后回旧版非自动无损 |
| 录屏证据 | 真实Provider与隔离合成分开；现有gate只暂停Lab，固定45→80不是学习提升；最新完整CI和目标机预演未完成不得称可录屏验收完成 |
| 真实对比 | 失败成本/额度先核验，再批准新的有界预算；不得重置账本、放宽门或自动发布 |

依赖风险豁免尚未批准。当前不声明完整账单对账、训练提升、零漏洞、生产 RTO/RPO 或可直接商用。

ADR25 working-tree foundation (not delivered): persist a task/message presentation
receipt and fenced answer attempt, same-interview/org composite FKs and one
unresolved question; UNKNOWN has no automatic paid replay. No provider calls under
the short parent-row transaction. Current uncommitted routes/UI integrate explicit presentation/v1, provider-free bounded stored-row selection, exact receipt scoring/replay and parent-locked end coordination; limited actual API/browser/strict restore local acceptance passed; exact CI/PR remains pending. See
[question presentation evidence](../acceptance/QUESTION_PRESENTATION_EVIDENCE.md).

ADR24增量B1a（PR46精确CI验收并合并）：采用构造期可信RuntimeAdapterRegistry包装既有引擎并接入实际runAgent；保留领域状态/CAS/费用权限，未知能力显式拒绝，不引入动态代码加载或空注册表。统一事件与完整能力清单另批实现，不宣称完整B1。

B1b增量（本地限定实链验收通过）：runAgent完成前经runtime-result.contract校验显式output/旧response对象；无效输出走既有失败状态/CAS/Trace，保留格式有效的适配器报告用量与估算，未知不补零。无API/schema/权限变更，非语义质量/完整信封/统一事件或真实账单。详见RUNTIME_RESULT_BOUNDARY_EVIDENCE.md；首新镜像API91/浏览器/严格恢复通过，精确CI待核。

B0策略准入增量（本地限定实链通过）：InterviewFlowController将startTurn的已发布策略/必需应用关联纳入模型前准入失败处理；不是可选观测失败。SSE错误与消息清理复用旧合同，complete/fail可选回写暂不变；无schema/公开API/权限变更。候选页面订阅错误显示并按会话切换清理，完整策略/遥测拆分及旧在途全局stream归属仍待。见INTERVIEW_POLICY_ADMISSION_EVIDENCE.md，未完成精确CI/发布。

候选SSE生命周期增量：当前唯一InterviewPage消费者将route interviewId传入useInterviewStream；切换/卸载先失效本hook请求代次再abort，旧异步结果不回写后续会话。没有后端取消/退款语义；多实例全局store与迟到HistoryGET另列，详见INTERVIEW_STREAM_SESSION_EVIDENCE.md。限定实链通过，待新headCI。

2026-10-23在验增量：完整模拟的规范题技能归属复用共享job-keywords-v1词典，只将实际题干唯一匹配到当前owned组织/岗位版本的active要求；歧义/未知保持null，记录question-job-lexical/v1依据。受控练习技能取实际Interview，追问父题仅同会话，不回填历史。无schema/模型调用增加；实际新镜像API/浏览器工程链与严格恢复本地通过，待精确CI；首题展示语义仍未验收，见GOLDEN_SKILL_ATTRIBUTION_EVIDENCE.md。

ADR26 (2026-10-29, candidate): distinguish deterministic business contracts from semantic quality; release-gate/v6 refuses smoke-only new releases, requires matching server-produced assertion evidence. Share production Interview decision requests/parser with the calibration runner rather than maintaining a second scoring Prompt. Explicit heuristic source, unknown costs/receipts and missing samples fail closed. Preserve legacy publication compatibility without retroactive certification. See ../harness/BUSINESS_ASSERTIONS.md.

2026-11-03 architecture candidate: [Interview catalog decision and migration](../architecture/INTERVIEW_QUESTION_CATALOG.md) and [recording guide](../runbook/RECORDING_READINESS.md). Preserve modular monolith and existing auth/Gateway; no framework rewrite or shared cross-tenant bank. Runtime57b0ac9's two CI runs failed at the business-assertion textarea locator after the bounded fixture-quota fix; explicit aria-label has39 local focused UI passes only. Catalog/API/UI/migration/helper changes are local candidates with root API1149/24skip, Web328, types/lint/build/Prisma/Golden30 passes; exact new-head migration/HTTP/PG/browser/recovery CI is outstanding. Portfolio assistant is a separate goal, not accepted here.

2026-11-03 Portfolio：公开内容与私有Interview数据分离；固定已发布单Agent只选资料ID，服务端输出来源原文；Origin非认证，Redis总额/准入与Gateway配额共同约束。签名票据为能力凭据不得日志记录。默认关闭，不回退任意直接模型。详见PORTFOLIO_ASSISTANT runbook。


2026-11-05 bounded portfolio ingress candidate: preserve original modular monolith/normal release-gate/v6; expose only fixed public portfolio routes through an independent credentialed gateway and a temporary HTTPS ingress, with native Sites server Secrets. User explicitly authorized Sites/Cloudflare secret transport. Keep keys encrypted locally/tmpfs, no public admin API, no background Keychain automation without consent. Normal30-sample real-provider deterministic contract evidence is not semantic or whole-product acceptance. See [decision](../architecture/PORTFOLIO_LOCAL_INGRESS.md).

2026-11-09 PLATFORM-RESTORATION: separate Trace diagnosis from data access and ingestion restoration. Reuse owned runtime GETs; explicit business-content expansion and bounded credential filtering; do not label legacy question-generation imports as generic document RAG. See PLATFORM_CAPABILITY_RESTORATION.md.
