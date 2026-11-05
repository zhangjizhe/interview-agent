# Changelog

2026-11-05 auth: daily email-send rejection now states the natural recovery date/time (Beijing time) through the existing public error contract. Limits, persisted failure counts and OTP protections are retained. The isolated real NetEase registration/password-login/email-reset flow passed with two messages, API-restart persistence, old-password/code replay denial and session revocation. This is bounded local evidence; owner manual recovery, sustained delivery, portfolio integration and whole-product quality remain outside this acceptance. Latest candidate CI/remote merge is a separate gate.

2026-11-04 latest AUTH-EMAIL-VERIFICATION: user requires the complete registration-code -> password-login -> email-code recovery -> new-password-login journey. Added email input to both recovery pages and email lookup to reset request/completion; legacy userId API callers remain compatible. Codes still bind verified email, purpose and user; unknown/unverified emails do not get reset codes or account existence disclosure.

Verified new scope: API auth/session/integration28, Web auth4, all three app types, relevant lint, three frozen-source Docker builds, syntax/diff; isolated real API/PG/Redis/TLS synthetic browser passed registration, password logins, email-input reset, revocation, replay/old-password denial and greeting fallback. Original local images updated; both password logins/profile/ADMIN and email-only recovery form passed without mail requests. Schema and volumes retained.

Real NetEase recovery succeeded once: exact challenge mail was received, normal reset completed, old access rejected, and new password logged into BOTH local entries. This was on the prior username-request form; the new email-input contract is only synthetic-tested so far. A separate isolated full real-mail journey then FAILED on its first registration send (CONNECT_TIMEOUT after bounded fallback); no account was created. Two sends were conservatively reserved in the original durable quota; only one send was attempted, and exactly the unused second reservation was reconciled with CAS. All real failures/cooldowns remain counted. No more live sends under unchanged conditions. Full real registration/recovery stability remains NOT_ACCEPTED; asked whether a backup SMTP sender exists, not for credentials.

Previous b6c9a64 push41806050891/PR41806057103 FAILED: full auth browser passed, later resume evidence hit actual429 after password login removed former mail cooldown. Fixture helper now waits61seconds and retries once only for an observed synthetic429; production limiter and final200 assertion stay intact. Do not reuse the earlier bf9cf6c green CI. New scoped commit/exact CI pending; PR65 stays draft and main unchanged. No whole-product, website/report or model-quality acceptance.

## Earlier snapshot (superseded by latest evidence)

2026-11-04 user correction: ordinary verified-account login now uses username/password directly, without SMTP or a new OTP. Registration, reset/change and first-time legacy claim retain mailbox verification. The previous every-login-code policy below is superseded. Registration checks username availability before mail; occupied IDs and mail503 never create accounts.

Actual new evidence: API auth/session/integration26 and Web auth4 pass; API/Web/Lab types, relevant lint, three frozen-source Docker images and syntax/diff checks pass. Isolated real API/PG/Redis/TLS synthetic browser passed registration, three password-only logins, change/reset/revocation/replay refusal and greeting-fault fallback. Original local Web AND Lab password login passed with ADMIN/profile readback and zero mail requests; occupied registration ID refused before mail. Local images updated, passwords/schema/volumes retained. Full real NetEase registration/recovery remains NOT_ACCEPTED. Previous bf9cf6c six green CI jobs do not certify this new diff; scoped new commit/CI next, PR65 stays draft and main unchanged. No unchanged-condition SMTP retry, OTP bypass or model-quality claim.

## Previous snapshot (login policy superseded above)

2026-11-04 auth: standard email-verified registration, every password login, authenticated password change and verified-mailbox reset; all-device session revocation. Add nullable verification timestamp and preflighted lower-email uniqueness. Web and Lab share account identity. Local original-data backup restoration, migration and explicitly authorized mailbox-verified owner recovery executed; see auth evidence for partial real-mail results and connection-timeout failures. SMTP uses bounded deadlines and strictly allowlisted diagnostics with secret-redaction regressions. No whole-product/model/deployment-quality claim. SMTP setup retries are limited to two freshly resolved addresses before message transmission, with the same code/counter and original-hostname TLS checks; ambiguous/later failures are not resent. Daily attempts are validated deployment configuration (default8, range1-20). Real NetEase delivery remains unaccepted; failed sends are preserved.

2026-11-03 candidate: public portfolio assistant using a fixed published Lab selector, atomic bounded admission, signed/redacted polling, checked verbatim sources, full historical article chunks and the actual portable site bridge. Default disabled; local tests are engineering evidence, target publication/model/deployment remain unaccepted.

2026-10-29 candidate: bounded BUSINESS_ASSERTIONS and v6 scoped release evidence; shared production scoring request/parser, heuristic source correction, fail-closed Golden/recording, bounded/idempotent evaluation UI. Exact acceptance pending; no semantic quality claim.

按 Keep a Changelog 分类，后续发布采用 Semantic Versioning。仓库当前 package 版本为 0.1.0；未核验到 v1.0.0 标签，因此不倒填发布日期。

## [Unreleased]

### Architecture candidate — 2026-11-03 (not accepted)

- Interview-owned PostgreSQL question current records and version snapshots, explicit same-organization maintenance adoption preserving legacy Milvus, separate rebuildable vector projection, durable SAVED/PENDING receipts and bounded explicit rebuild. Actual initial selection propagates catalog version/hash; current PG content filters vector hits before rerank. Lab adds the real governance UI. See [catalog migration](docs/architecture/INTERVIEW_QUESTION_CATALOG.md).
- Runtime prerequisite `57b0ac9` limits the isolated administrator fixture to200 calls while retaining normal Free100 assertions, and removes Lab Run IDs from Interview foreign-key context. Its two CI runs subsequently failed on the assertion textarea's exact accessible-name locator; an explicit aria-label repair has39 local focused UI passes. No complete browser/recovery pass is claimed.
- Root local catalog verification: API1149 passed/24 skipped, Web328, types/lint/build, Prisma validation and provider-free Golden30 passed. New catalog migration/HTTP/PG/Milvus/browser assets are wired into CI, but the combined new source is not yet pushed or remotely accepted. Local Docker unavailable; no deployment or paid model-quality result.
- Add [recording readiness](docs/runbook/RECORDING_READINESS.md), separating real product calls from synthetic engineering checks and documenting the Lab-only manual gate. Public bank sharing, human calibration and portfolio assistant delivery are not included.

### Documentation

- 校准内部预发布仪表、静态清单数量和候选黄金链证据缺口，归档历史上下文并明确训练动作下一验收合同；不新增产品通过结论。

### Fixed

- Confirmed question-only sessions now exit through the verified end receipt instead of navigation alone; confirmation in progress blocks exit, and the empty-message action states that no report is generated. Component red/green and complete private browser/strict recovery passed with independent original-log review; exact candidate CI remains pending.

- PR63 CI prerequisite (local security and complete private gates passed, exact remote CI pending): pin supported Ubuntu24.04 runners and minimal dependency security updates, remove unused Mem0 SDK while testing the actual REST credential boundary, and add checksum-verified Zod3 collection guards alongside Zod4.6.6. Upstream Zod3 HIGH remains disclosed; raw oversized sets reject before element transforms. See SECURITY_DEPENDENCY_GATE_2026_10_24.md.

- Local stage verified, exact CI/PR pending: explicit persisted question presentation and answer identity, saved-bank initial selection, fenced scoring/replay, safe end coordination and bounded browser state recovery. Limited real API/browser and strict restore passed; exact CI/PR and deployment remain pending.

- 完整模拟规范题仅将真实题干唯一匹配到当前用户/组织/岗位版本的有效技能要求，保留歧义与未知；补明确英文前后端类别及同会话追问父题限制。增加私有合成provider/默认多Agent实际API与浏览器训练复测工程链，不代表首题展示、真实模型质量或整体验收通过。

- 简历上传校验Milvus写入状态与Strong同归属内容读回；存储结果未知时返回503并停止后续个性化调用，候选页面仅接受明确保存成功回执。增加完整SDK等待上限、float向量验证及业务503透传；隔离API/浏览器与严格恢复通过，未作为完整产品发布通过。

- 固定生产SDK链ip-address至10.7.4，消除恶意IPv6 zone二次匹配拒绝服务公告，增加真实安装链有界子进程与正常IP回归；不改变审计门或原braces补丁边界。

- 训练岗位与建议GET增加覆盖响应头/正文的60秒上限和查询取消，读取错误与空状态分离，提供仅GET重新加载；成功写入后刷新失败不再无限忙碌。

- 训练完成、复测和更新建议的POST头与正文等待增加60秒上限及页面失效清理，超时保留未知结果并提示更新核验；不撤销后台动作。

- 训练完成与复测增加等待互锁、失败提示和匹配回执校验，岗位版本变化后忽略旧动作结果。

- 面试结束60秒超时覆盖响应正文读取，页面失效清计时器并终止客户端等待，超时明确提示先核验未知结果。

- 面试结束请求在页面切换或卸载后不再改写当前页面完成/加载状态、弹窗或导航，保留后端已执行动作的真实边界。

- 结束面试仅在成功HTTP及明确删除/当前面试报告回执后导航，拒绝空回执、错误归属和空白报告ID，避免失败响应误标完成。

- 简历确认开始后失效较早历史快照，确认在途下拉刷新不发GET，避免成功确认又被旧状态锁回。

- Interview同会话历史GET只应用最新请求且消息未变化的快照，流式期间刷新不发GET，防止旧空历史擦掉新回答。

- Interview历史加载与下拉刷新在切换面试/卸载后拒绝迟到GET写入，包含A→B→A和延迟响应体，保留当前正常加载/刷新与报告跳转。

- Interview切换面试或卸载时失效并中止原流式消费，防止旧响应结束/错误改写下一会话输入状态；不承诺停止服务端在途工作或退款。

- 将传递依赖Hono固定至4.13.11、follow-redirects至1.16.1以修复新增安全公告，保留原安全审计门并补本地凭据重定向回归。

- Interview已发布策略/应用回合初始化失败时停止模型调用，走原SSE错误和未回答消息清理；候选页面显示流式错误并在切换面试时清除旧提示。

- Lab运行适配器缺失或损坏最终response时记录失败；保留格式有效的报告用量与费用估算，避免误报完成或丢失失败费用线索。

- Interview 简历确认校验HTTP与精确成功回执，并隔离重复/迟到请求；Lab桥固定同一已发布回合版本，拒绝Run/policy错配。
- 更新全自建可替换AgentLab与Interview完整规划、官方商业对标、双闭环、适配器目标及B0-B6验收路线。

- MCP 内置工具在调用前重新检查启用状态及父服务策略，阻止关闭后缓存执行函数继续调用；Lab 明示进程范围并提供未确认回执后的只读状态恢复。

### Added

- Provider-free question presentation persistence foundation with same-interview
  tenant foreign keys, one unresolved question and fenced answer attempts, plus
  private PostgreSQL/migration regression checks. Candidate API/UI integration and
  the first-question product fix remain pending; this is not a delivery claim.

- B1a构造期运行适配器注册与Nest实际分发，包装既有legacy/single/finite，未知引擎或缺能力拒绝且不静默降级；完整统一事件合同仍待实现。

- 外部Run初始化的必需消息持久化失败时，条件记录FAILED并保留原错误；清理失败保持未确认并输出脱敏事件。

- Lab 操作日志分页按钮提供明确可访问名称；新增真实21条合成日志的20+1页键盘往返与筛选重置验收。

- Lab MCP 系统开关校验成功回执的工具名、目标状态与确认标记；损坏回执提示先读取状态核验。

- Lab 启动回读追加核对本次请求键、原始输入及草稿运行用途，避免同Agent同版本的其他运行被误认成功。

- Lab 启动后读取实际运行，校验运行ID与提交的Agent/版本；读取失败或错配保留原运行和请求键，提示核验。

- Lab 在明确切换版本、Agent 或新增草稿时清理上一操作的错误提示，保留在途切换锁。

- Lab 取消回执校验运行ID、状态和取消时间；损坏回执显示结果未确认，终态无取消记录显示已结束。

- Lab 启动回执校验运行ID、状态与复用标记；不完整回执保留旧运行、确认和幂等请求键供明确核验重试。

- Lab 展示运行关联Agent和固定版本，缺失显示未记录；运行中跨版本历史恢复与旧运行取消已完成隔离阶段验收。

- Lab 运行回执等待期间冻结目标、输入与保存/历史选择，版本切换清当前运行；真实启动复用及组件取消恢复阶段验收通过。

- Lab Agent 切换编辑上下文或开始下一次保存时清除旧保存反馈，避免遗留成功提示；隔离完整链验收通过。

- Lab Agent 保存前校验回执身份、版本关联及草稿状态，畸形成功回执保留编辑并提示核验持久化结果。

- Lab Agent 保存期间冻结目标和配置编辑，失败后恢复草稿；真实隔离API/浏览器与存储恢复阶段验收通过。

- Lab 题库读取失败提供同条件重试入口，在途禁用；隔离真实 API/浏览器和存储恢复验收通过，整体产品仍待验收。

- 更新逐项UI验收清单为980源码模板，新增编排/首次发布和Router链接；生成器拒绝覆盖已有验收证据，旧清单归档。

- 自定义 Agent 与固定版本有限工作流，原子草稿创建、受控测试、预算与持久幂等队列、取消及节点 Trace。

- 评测任务支持排队取消和样本边界取消，保留费用及租约；增加真实训练 HTTP/数据库、向量写入和缓存维护验收。
- 答案缓存支持部署 revision；停用旧集合提供默认预览、快照与准确 ID 计划校验的维护工具。

- 新增统一测试基线、按优先级整理的 Roadmap 与审查落实记录。
- 增加 Langfuse 出口脱敏回归测试。

### Changed

- README 首屏说明 AI 面试业务与 AgentLab 的编排、检索、网关、评测入口。
- 将完整 AgentLab 迁移契约移到独立文档，保留原接口与已知限制。
- 历史验收结果与当前验证分开描述；简历材料按 NestJS 默认路径重写。
- Docker 启动脚本直接使用镜像内构建；新截图默认忽略，现有证据保留。

### Fixed

- 题库插入严格校验主键回执；仅完整回执经补偿与 Strong 空读回后报告已回滚，部分或未知回执保持未确认，不重试插入或模型调用。

- MCP动态工具调用即时遵守父服务及自身关闭；健康探测使用已连接客户端的真实协议 listTools。

- Lab题库列表与搜索省略空筛选；MCP重载保留绑定/关闭状态并拒绝错误，修正健康与绑定就绪展示，增加独立回归及真实镜像HTTP验证。

- Lab Golden Dataset 版本改为组织内唯一，修复新组织管理员首次登录后 dashboard 404；增加真实数据库及镜像 HTTP 回归、控制台重试连接。

- Lab API 代理动态解析 Docker DNS，修复 API 容器重建后登录/注册返回 502。

- 两端退出执行服务端会话吊销；修复训练证据遗漏 skillId、并发重复完成及复测关联。
- 恢复五份历史合同测试并移除全部历史路径排除；压缩决策缓存按完整内容、role 和 tier 隔离。

- 修正快速开始遗漏 JWT_SECRET 的问题。
- 恢复无需 DI 的 ResumeParser/PDF 清洗测试；将知识题库测试从 Vitest 导入改为 Jest 默认环境并恢复执行。

### Security

- 升级 NestJS 11、React Router 7 与兼容传递依赖；braces AST 深度、循环与大小防护加入固定 SHA 补丁及 SDK 回归。官方 advisory 仍为 1 high，无零漏洞声明。

- Langfuse metadata、input、output、工具错误和流式输出更新增加递归脱敏，保留 token 计数。
- 此修复不代表全面 PII 合规，也不自动清理已上传的历史记录。

### Known Limitations

- 专用 PostgreSQL 测试与默认离线 Jest 分开运行；真实质量、生产容量、OAuth/MFA、SSE offset 恢复与第三方隐私评估仍待验收。
- Mem0 与其他第三方数据流需要隐私评估；自由文本 PII 和其他日志出口仍需审计。
- 缓存收益尚无普遍结论，保留历史 0% 命中与后续总 Token 增长的证据。
- 尚未发布 v1.0.0、在线 Demo 或合并默认分支。完整限制见 docs/ROADMAP.md。


## Unreleased — restricted local portfolio ingress

Added an independent two-route authenticated gateway, bounded request/response handling, tmpfs secret consumption, pinned Docker deployment and Node20/22 safety/real-HTTP CI checks. Includes neutral document selector evaluation assets and records actual local real-provider contract/report evidence separately from pending hosted-page acceptance. No general API/schema change or sustained server availability claim.

Fixed the configured portfolio adapter for Workers redirect compatibility: use manual/no-follow handling and reject redirects before releasing an answer. Added server-only dedicated gateway authentication to the repository example; older conversation-context WIP is excluded.
