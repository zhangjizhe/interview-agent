# 当前决策索引

更新：2026-10-09。完整 ADR 在 [architecture-decisions.md](../architecture-decisions.md)；旧汇总[归档](archive/release-readiness-2026-10-08/DECISIONS.md)。

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
