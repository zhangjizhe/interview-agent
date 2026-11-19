# 当前架构地图

2026-11-19隔离候选：JobsPage复用原API，校验记录/ID/active回执，sessionStorage保存账号内未知操作标记；GET核对+显式解锁，弹窗内展示读取内容，不自动重放。已确认回执先更新Query缓存，后台读取不锁住焦点/按钮。ResumesPage验证摘要字段、岗位读取前置和上传存储预检。无API/Schema/权限/模型变化；45回归及有限浏览器证据，未部署。见../acceptance/PREPARATION_PRODUCT_DESIGN_ACCEPTANCE.md。

2026-11-18候选、未部署：Web私有QueryClient从main移到按会话epoch重挂载的AuthenticatedWorkspace，退出/失效/换号清理生命周期。Web会话一次发布完整snapshot并保留退出tombstone，旧字段只作首次升级读取；fetch与Web兼容入口统一读取。Lab独立origin协议未迁移，不是SSO；无API/Schema/权限/模型变化。75项相关测试和合成双标签通过，真实服务/旧包升级与回滚待验。见../acceptance/SESSION_CACHE_ISOLATION.md。

2026-11-18输入视口增强：viewport请求Chrome resizes-content；密码弹窗优先visualViewport，缺失时window.resize/innerHeight，并过滤无效尺寸。输入滚动留白不改业务/API或UA路由。对应23项回归和三种合成键盘模型通过，原生微信/WebKit实机未核实。

2026-11-17移动布局：mobile-layout.css作为Lab样式最后一层统一处理手机宽度/触控/安全区；LabShell移动抽屉，AccountSecurityDialog通过body portal保持在inert背景外，page-scroll-lock按所有者释放锁，visualViewport只调整弹层。无API/Schema/模型变化，详见LAB_MOBILE_LAYOUT.md。

2026-11-17本机流程修复：AgentCatalog/Builder调用既有受保护目录、版本、Run及新增ADMIN archive。Registry归档/activate与DecisionRecord同事务；Runtime父Agent ARCHIVED前置拒绝，工作流依赖/公开助手入场排除已归档Agent；不撤回在途调用。MCP仍进程内配置，无租户级或重启持久化承诺。题库分页仅已加载数据。无DDL，详见LAB_WORKSPACE_FLOWS.md。

2026-11-17本地UX：Lab入口由index.html→bootstrap.tsx挂载现有LabSessionGate；main.tsx保留ControlCenter业务。LabShell负责分组导航/响应式框架，useLabNavigation仅保存白名单页面URL，Trace沿用受保护Run/Trace读取并在URL保存选择。汇总读取按页面启用，错误不替换框架；401仍走原会话失效。API/Schema/权限边界未改，未公网发布。详见LAB_WORKSPACE_UX.md。

2026-11-16 当前唯一任务：个人网站经 Agent Lab 返回已校验的分段 SSE，详见 docs/project/PORTFOLIO_STREAMING.md。真实网页已在运行完成前两次显示内容，单次模型调用完成且有6条持久流检查点；估算0.000948CNY非账单。相关143项离线回归、类型/Lint/API及Docker构建通过；本机API已部署并保留旧容器及211条既有Run，首次启动参数错误回滚亦保留记录。不是逐Token输出；公网TLS及JSON-only外部网关仍未通过，GitHub最新CI/合并待核验。无数据库迁移、未改鉴权或已发布Prompt、未混入历史网站WIP。

2026-11-11 资料分权源码（PR #72已合并）：Lab DataGovernanceWorkspace/DataBindingPicker → ADMIN + 可信组织身份 → DataGovernanceService → PostgreSQL typed collection/record/version/grant/audit。默认私有；平台ADMIN不越过资料ACL；AgentVersion显式绑定，ConfiguredRuntime在读取和派发前重新授权，Trace记录实际资料revision/hash而非正文。旧Interview题库与评测集不迁移。加性迁移20261105000000；隔离DB/HTTP/浏览器/恢复及main4352323 Product5项通过，原API/5175未更新。见[设计与边界](../architecture/LAB_DATA_GOVERNANCE.md)。

2026-11-10 题库UX：Lab QuestionImportPanel复用原Interview import-file/import-url，文件选择不自动提交，岗位/category/level显式归类，严格回执与PENDING显示，错误后保留页面草稿且不自动付费重放。高级维护下移折叠。无schema/API/权限变化；本机只替换前端，真实导入效果与后台任务/幂等仍未验收。见[UX证据](QUESTION_BANK_UX.md)。

2026-11-10 读取恢复候选：Lab题库页新增独立KnowledgeLibraryPanel → 既有知识list GET → 可信组织Qdrant历史集合；与Interview业务题库（LEGACY Milvus或已采用PG）及评测数据分开。只读200条上限/本地筛选/纯文本展开；service存储失败改503。无新schema/授权/模型调用，未部署验收。原存储已启动且读到16业务题/约142RAG记录，完整历史对账未完成。见[读取恢复证据](QUESTION_BANK_READ_RECOVERY.md)。

2026-11-09 recording candidate: ControlledEvolutionWorkspace → EvaluationRunLinks → existing ADMIN/workspace-scoped GET Run/Trace. Panel checks report Agent/version identity, hides private payloads and has no execution mutations.

2026-11-06 portfolio presentation repair: rank fixed technical references by retrieved evidence; retain exact validated legacy inputs for paid Run reconciliation. Strict professional renderer still fails missing notes; delivery catches only that typed condition to return verbatim public facts, with facts-only evidence mode and a text-free operator diagnostic. No new model call, schema, public protocol or publication path.

2026-11-05: portfolio-assistant → fixed public profile + technical registry → normally published configured guide → existing Gateway/Run/Trace. JSON-object transport is explicit opt-in; server validates all output before public display. No new database/schema/tool/private retrieval. Site v7 preserves v6 cache/optional stream adapter and sends bounded prior user questions on follow-ups.

2026-11-04 user correction: ordinary verified-account login now uses username/password directly, without SMTP or a new OTP. Registration, reset/change and first-time legacy claim retain mailbox verification. The previous every-login-code policy below is superseded. Registration checks username availability before mail; occupied IDs and mail503 never create accounts.

Actual new evidence: API auth/session/integration26 and Web auth4 pass; API/Web/Lab types, relevant lint, three frozen-source Docker images and syntax/diff checks pass. Isolated real API/PG/Redis/TLS synthetic browser passed registration, three password-only logins, change/reset/revocation/replay refusal and greeting-fault fallback. Original local Web AND Lab password login passed with ADMIN/profile readback and zero mail requests; occupied registration ID refused before mail. Local images updated, passwords/schema/volumes retained. Full real NetEase registration/recovery remains NOT_ACCEPTED. Previous bf9cf6c six green CI jobs do not certify this new diff; scoped new commit/CI next, PR65 stays draft and main unchanged. No unchanged-condition SMTP retry, OTP bypass or model-quality claim.

## Previous snapshot (login policy superseded above)

Auth (2026-11-04): Candidate Web and Agent Lab share the NestJS Auth API/user table. AuthEmailService uses TLS SMTP and purpose/address/user-bound, one-use HMAC challenges in Redis. Prisma adds nullable emailVerifiedAt and a preflighted lower-email unique index. All registration/login/change/reset paths require mailbox proof; changes revoke sessions. The original local stack has applied the additive migration and retained its volumes. Local SMTP credentials use encrypted macOS Keychain plus tmpfs/runtime injection; no cloud secret-store claim. Acceptance and SMTP timeout history: CURRENT_STATE.md and ../acceptance/AUTH_EMAIL_VERIFICATION_EVIDENCE.md. SMTP setup retries are limited to two freshly resolved addresses before message transmission, with the same code/counter and original-hostname TLS checks; ambiguous/later failures are not resent. Daily attempts are validated deployment configuration (default8, range1-20). Real NetEase delivery remains unaccepted; failed sends are preserved.

更新：2026-11-03。默认产品为模块化单体；详细旧地图[归档](archive/release-readiness-2026-10-08/ARCHITECTURE_MAP.md)，代码优先。

## 2026-11-03 题库主数据与录屏候选（待精确CI）

[INTERVIEW_QUESTION_CATALOG](../architecture/INTERVIEW_QUESTION_CATALOG.md)定义当前代码边界。QuestionBankService编排PG业务主数据/历史版本；QuestionVectorIndexService保留旧Milvus能力，QuestionCatalogIndexService维护独立新索引。租户未显式采用时继续LEGACY，维护窗口两次Strong源快照核对后同事务写入目录/版本/采用状态，旧源保留。Lab QuestionCatalogPanel仅调用Interview受ADMIN保护的status/adopt-legacy/rebuild-index API，评测Dataset/Case仍独立冻结。

采用后题目先提交PG再索引，失败为SAVED/PENDING；同内容重试不自动再次付费，显式重建每批最多20。PG直接供首题选择并记录catalogVersionId/contentHash；向量命中先按当前组织/版本/删除状态hydrate，再向rerank发送PG内容。组织状态行锁串行新服务写入；外部旧写入须人为停写，不能把锁称为跨旧系统的无中断迁移。新索引可重建，不代表自动压缩或自动故障探测。

加性迁移20261102000000提供state/entry/version与组织FK/版本UPDATE拒绝。尚未核实目标部署的迁移/采用；旧源不包含采用后的PG新写入，回滚要冻结、导出核对，不直接切旧版。公共题库共享、语义质量、全部历史回填未交付。root本地API1149/24skip、Web328及types/lint/build/Prisma/Golden30通过，后补textarea label39项UI定向通过；实际PG/browser/恢复待未推送新headCI。录屏端口/gate/合成边界见[RECORDING_READINESS](../runbook/RECORDING_READINESS.md)。Portfolio助手当前仅为另行开发目标。

| 层 | 入口 | 当前合同 |
| --- | --- | --- |
| Interview | apps/web/src | JWT 会话、候选人导航、岗位/简历/面试/报告与训练入口 |
| Lab | apps/agent-lab/src | ADMIN 门禁、MCP/题库/录制报告与 ControlledEvolutionWorkspace |
| 授权 | apps/api/src/modules/auth | 全局 JWT、ADMIN RBAC、用户资源归属与组织范围 |
| 面试 | apps/api/src/modules/interview | 持久化业务状态、回答/正式证据、SSE、训练关联；候选题库主数据/版本由Interview拥有，非Agent私有资产 |
| Agent | apps/api/src/agents/multi-agent、modules/agent | LangGraph、checkpoint、受控版本与 Gateway adapter |
| 模型 | apps/api/src/modules/llm | Qwen/DeepSeek、原子额度、集中费率证据、完整请求答案缓存 |
| 作品集助手 | modules/portfolio-assistant + examples/portfolio-site | 默认关闭；固定已发布选择器/公开32片段/正常Lab队列/Redis准入与签名只读票据；仅原文，不读私有题库 |
| 平台 | apps/api/src/modules/agent-lab | AgentVersion/Application/Run/Trace/Evaluation；当前v6确定性输出合同门禁，不是语义质量认证 |
| 评测任务 | 同模块 EvaluationJobsService | PostgreSQL PENDING/RUNNING、requestKey、资产指纹、CAS 租约/进度及 CANCELLED；取消在样本边界结算、不重放 |
| 检索 | modules/knowledge-base、modules/memory | Milvus 混合检索、Qdrant；旧答案相似缓存不再读取 |
| 数据 | apps/api/prisma | PostgreSQL，租户/额度/冻结证据约束与加性任务迁移 |
| 观测 | infra/observability | Prometheus/Grafana；进程指标重启归零，完整账单另核验 |
| 交付 | docker-compose.yml、三端 Dockerfile | migration 独立先行、pnpm 9 冻结依赖与 patches、API readiness；本机映射仅绑定 loopback，Redis AOF 与 noeviction |
| CI | .github/workflows/ci-api.yml | 严格 lint/type/test、Redis、专用 PG 升级与三端镜像；API smoke 写入 Milvus，并对 PostgreSQL/Milvus+etcd/Qdrant 做隔离恢复；不吞掉失败 |

答案缓存只复用完整主模型文本；指纹含租户/用户/面试、系统/历史/模型/有效参数/套餐，Redis TTL 一小时。工具、截断、fallback 与旧缓存不复用；Lab 评测始终 bypass。

发布 Dataset 冻结与审查后进行有界重复评测；同集统计/切片/资源/费率/缓存隔离证据齐备才可人工发布。录制 Harness 的人工决定与真实 Agent 发布分离。无 OS 沙箱、远程 worker 或自动付费重试；py-api 实验实现不作产品路径依据。

安全迁移保持 Node 20/React 18，braces 补丁覆盖字符串与 AST；CI 保留上游 high 并验证固定补丁。ContextManager 缓存以完整内容/role/tier SHA-256 区分决策，容量 1000、命中刷新 LRU。全部旧 Jest 排除已解除；真实模型与生产验收另核验。

Lab Golden Dataset 版本按 organizationId/version 唯一，可信租户上下文 upsert；不同组织有独立同版本记录，旧 ID/关系保留。首次新组织 dashboard 已纳入实际镜像 HTTP 与专用 PG 回归。

## 配置运行时演进（2026-10-08）

AgentLab扩展ConfiguredRuntimeService与ConfiguredRunJobsService；AgentVersion.runtimeConfig保存single-agent-v1/finite-workflow-v1，Run保存队列幂等/租约与父子节点。调用统一Gateway且禁用自动fallback，Trace记录真实节点；发布门不变。新增202 test-runs/runs/cancel、runtime/models和事务configured-agents入口。加性迁移 `20261008030000_configured_run_jobs`。实施/验收中，不代表整产品交付，详见 `docs/architecture-decisions.md` ADR 22。

题库embedding/rerank统一走LlmGateway→QwenProvider，并由QuotaService在外部请求前预留LLM_CALL、在UsageLedger.metadata结算usage/估算或未知；正文不入receipt。辅助模型价格目录2026-10-09.1。此变更20迁移部署状态见当前活动任务。

发布闭环ADR23：首次无基线调用Registry单版本门禁，事务currentVersionId CAS；评测最终response与有界schema契约final-output/v1，发布门v5拒绝旧规则记录。恢复验收按完整COPY行多重集合、DDL及sequence严格比较，失败保留合成诊断选项；不推断未知历史差异根因。


## 2026-10-19 自建可替换架构路线

目标端口与兼容迁移见[REPLACEABLE_AGENT_CONTRACTS](../architecture/REPLACEABLE_AGENT_CONTRACTS.md)。该路线初始审计时AgentRuntimeService直接依赖MultiAgentService并按适配器字符串分支；后续B1a已用Registry接入实际runAgent，见下文；ToolRunner未贯穿所有旧工具路径，配置Agent拒绝非空tool/knowledge/memory绑定。规则评测与发布治理存在，语义Judge/人工校准未交付。不能称为已完成可替换通用Agent平台。

本轮Bridge回合固定一个PUBLISHED快照，并将id传入startExternalRun/核验返回Run，避免并发发布造成记录与policy错配；关联失败尽力终结Run。Interview控制器仍允许Bridge失败后继续原流程，这不是强制已发布策略合同；会话快照与策略/遥测拆分为B3。前端简历确认只有真实成功回执才解锁，并隔离页面/请求生命周期。无新增表、API形状、模型或付费调用。

B1a已由PR46精确CI验收并合并：agent-lab/runtime-adapter.registry.ts + builtin-runtime.adapters.ts经Nest factory接入AgentRuntimeService.runAgent，既有legacy/single/finite包装；Run/权限/CAS/Trace/费用仍领域服务拥有，非动态插件/完整统一事件。见RUNTIME_ADAPTER_REGISTRY_EVIDENCE.md。

B1b增量（本地限定实链验收通过）：runAgent完成前经runtime-result.contract校验显式output/旧response对象；无效输出走既有失败状态/CAS/Trace，保留格式有效的适配器报告用量与估算，未知不补零。无API/schema/权限变更，非语义质量/完整信封/统一事件或真实账单。详见RUNTIME_RESULT_BOUNDARY_EVIDENCE.md；首新镜像API91/浏览器/严格恢复通过，精确CI待核。

B0策略准入增量（本地限定实链通过）：InterviewFlowController将startTurn的已发布策略/必需应用关联纳入模型前准入失败处理；不是可选观测失败。SSE错误与消息清理复用旧合同，complete/fail可选回写暂不变；无schema/公开API/权限变更。候选页面订阅错误显示并按会话切换清理，完整策略/遥测拆分及旧在途全局stream归属仍待。见INTERVIEW_POLICY_ADMISSION_EVIDENCE.md，未完成精确CI/发布。

候选SSE生命周期增量：当前唯一InterviewPage消费者将route interviewId传入useInterviewStream；切换/卸载先失效本hook请求代次再abort，旧异步结果不回写后续会话。没有后端取消/退款语义；多实例全局store与迟到HistoryGET另列，详见INTERVIEW_STREAM_SESSION_EVIDENCE.md。限定实链通过，待新headCI。

2026-10-23在验增量：完整模拟的规范题技能归属复用共享job-keywords-v1词典，只将实际题干唯一匹配到当前owned组织/岗位版本的active要求；歧义/未知保持null，记录question-job-lexical/v1依据。受控练习技能取实际Interview，追问父题仅同会话，不回填历史。无schema/模型调用增加；实际新镜像API/浏览器工程链与严格恢复本地通过，待精确CI；首题展示语义仍未验收，见GOLDEN_SKILL_ATTRIBUTION_EVIDENCE.md。

ADR25 working-tree foundation: InterviewQuestionPresentation binds task and presented/claimed messages with same-interview/org composite FKs; partial unique/state checks and short guarded parent transactions protect provider-free claims. Merged foundation is registered by the current uncommitted presentation/v1 integration. Shared QuestionBankModule supplies provider-free bounded stored-row initial selection; confirm/claim/end share short parent transactions, while reads/model work remain outside them. Limited API/browser/strict restore local gate passed; exact CI/PR and target deployment remain pending; see QUESTION_PRESENTATION_EVIDENCE.md.

2026-10-29 candidate ADR26: Lab BUSINESS_ASSERTIONS evaluator consumes bounded response JSON and configured positive Trace events; v6 publication requires matching deterministic-contract evidence. Golden uses shared interview-decision/v1 parser/messages and guarded report/recording. Evaluation submission uses validated receipts and scoped persistent unresolved intent keys; all-trial stopping budget <=3CNY. Additive EvaluatorType enum migration. These are candidate source facts, not semantic/model or deployment acceptance.


2026-11-05 portfolio ingress candidate: hosted Site server/BFF → independent restricted gateway → existing PortfolioAssistant/Redis admission → normally published configured Agent/Gateway → private Run/Trace and separate EvaluationRun report. API/admin/database ports retain loopback bindings. Gateway has only two public fixed routes and an independent server credential; temporary tunnel is not permanent server delivery. No schema/runtime rewrite. See [local ingress decision](../architecture/PORTFOLIO_LOCAL_INGRESS.md); user page confirmation and actual service-access answer/refusal passed; exact final CI remains pending.

2026-11-09 Trace diagnostics candidate: RuntimeTraceWorkspace reads owned runtime Runs; shared RunInspector reads exact Run/Trace in main, builder and evaluation report. Legacy Harness summaries remain separate; no new API/schema or model path.

2026-11-18 Interview frontend local increment: WorkflowDialog body portal/inert/focus lock and useVisibleViewport shared by dialog/room; candidate-workflow.css scopes responsive controls. Existing auth/upload/start/SSE/report APIs and schema preserved. UI-only synthetic acceptance and local5173 replacement; real interview/quality and remote CI pending. See INTERVIEW_WORKFLOW_UX.md.

2026-11-18 preparation hub: candidate routes /prepare/{resumes,jobs} share PreparationLayout. Account settings remain /settings. ResumesPage reuses existing own-user Milvus summary read and explicit paid upload endpoints; persistent per-account unresolved upload marker prevents implicit retries. No schema, API or ownership change; no complete-history/version-selection claim. See INTERVIEW_PREPARATION_REDESIGN.md.

2026-11-18 candidate journey increment: /practice uses an explicit practice view in HomePage rather than the overview/modal. The legacy inline resume upload is removed in favor of ResumesPage; records route directly to ReportPage. Confirmation/scope/unknown-result guards are frontend only; existing owned backend APIs and schema preserved. See INTERVIEW_UX_PRODUCT_AUDIT.md for hard-delete/idempotency and real-quality gaps.
