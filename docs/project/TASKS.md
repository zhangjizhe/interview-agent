# 待办与验收门

2026-11-04 latest AUTH-EMAIL-VERIFICATION: user requires the complete registration-code -> password-login -> email-code recovery -> new-password-login journey. Added email input to both recovery pages and email lookup to reset request/completion; legacy userId API callers remain compatible. Codes still bind verified email, purpose and user; unknown/unverified emails do not get reset codes or account existence disclosure.

Verified new scope: API auth/session/integration28, Web auth4, all three app types, relevant lint, three frozen-source Docker builds, syntax/diff; isolated real API/PG/Redis/TLS synthetic browser passed registration, password logins, email-input reset, revocation, replay/old-password denial and greeting fallback. Original local images updated; both password logins/profile/ADMIN and email-only recovery form passed without mail requests. Schema and volumes retained.

Real NetEase recovery succeeded once: exact challenge mail was received, normal reset completed, old access rejected, and new password logged into BOTH local entries. This was on the prior username-request form; the new email-input contract is only synthetic-tested so far. A separate isolated full real-mail journey then FAILED on its first registration send (CONNECT_TIMEOUT after bounded fallback); no account was created. Two sends were conservatively reserved in the original durable quota; only one send was attempted, and exactly the unused second reservation was reconciled with CAS. All real failures/cooldowns remain counted. No more live sends under unchanged conditions. Full real registration/recovery stability remains NOT_ACCEPTED; asked whether a backup SMTP sender exists, not for credentials.

Previous b6c9a64 push41806050891/PR41806057103 FAILED: full auth browser passed, later resume evidence hit actual429 after password login removed former mail cooldown. Fixture helper now waits61seconds and retries once only for an observed synthetic429; production limiter and final200 assertion stay intact. Do not reuse the earlier bf9cf6c green CI. New scoped commit/exact CI pending; PR65 stays draft and main unchanged. No whole-product, website/report or model-quality acceptance.

## Earlier snapshot (superseded by latest evidence)

2026-11-04 user correction: ordinary verified-account login now uses username/password directly, without SMTP or a new OTP. Registration, reset/change and first-time legacy claim retain mailbox verification. The previous every-login-code policy below is superseded. Registration checks username availability before mail; occupied IDs and mail503 never create accounts.

Actual new evidence: API auth/session/integration26 and Web auth4 pass; API/Web/Lab types, relevant lint, three frozen-source Docker images and syntax/diff checks pass. Isolated real API/PG/Redis/TLS synthetic browser passed registration, three password-only logins, change/reset/revocation/replay refusal and greeting-fault fallback. Original local Web AND Lab password login passed with ADMIN/profile readback and zero mail requests; occupied registration ID refused before mail. Local images updated, passwords/schema/volumes retained. Full real NetEase registration/recovery remains NOT_ACCEPTED. Previous bf9cf6c six green CI jobs do not certify this new diff; scoped new commit/CI next, PR65 stays draft and main unchanged. No unchanged-condition SMTP retry, OTP bypass or model-quality claim.

## Previous snapshot (login policy superseded above)

2026-11-04 唯一主题 `AUTH-EMAIL-VERIFICATION`，真实邮件阶段仍 **NOT_ACCEPTED**。原库备份已在隔离库恢复并核对用户/Run/组织数量；原卷保留且加性迁移完成。用户明确授权的原账号本机管理员恢复已通过真实邮箱OTP完成，身份/组织不变、旧会话撤销。

源码侧有界SMTP连接备用、严格TLS/脱敏日志、默认8次且可配置1-20的发送限制、标题修复已完成；本机私有验收配置20次，未清计数，60秒冷却不变。45项认证测试（含15邮件测试）、lint/typecheck/build及真实API/DB/Redis/Chrome/合成TLS首欢迎故障验收通过。基线51e795e对应CI41772980806三项绿；新head需独立核对。

真实网易部分注册/登录/改密、原账号Lab登录与重启读取已通过，但候选人页面及原账号完整找回/最终双入口登录仍超时失败。已请用户检查网易安全/第三方客户端提醒；条件未变化不重放。当前仍为钥匙串临时恢复密码，生成的新重置密码未应用。秘密仅本机加密/运行内存，私有配置不提交。详见 CURRENT_STATE、ACTIVE_TASK 和邮箱验收证据。

`PORTFOLIO-ASSISTANT` 暂停保留，仍 NOT_ACCEPTED；正常发布、真实来源问答、正式评测报告和公开接入待独立阶段。本主题未发起外部模型调用。以下历史记录不代表当前状态。

2026-11-03 当前唯一主题PORTFOLIO-ASSISTANT：固定32公开片段/正常发布selector/Lab持久队列/Redis有界准入与24h跨IP幂等/原文来源输出/实际网站BFF已本地实现；API1199/27skip、Web333、站点24通过，最终构建/精确CI待核。旧题库51d5c2b两run六项CI与原始日志已通过，仅隔离工程阶段；远端Wiki5403d81已保留。目标部署、正常发布版本配置、真实模型/账单和桌面hexo-bolg读取仍无证据。

2026-11-03 当前候选：QUESTION-CATALOG-ARCHITECTURE与录屏准备，**NOT_ACCEPTED**。原head115b5c6因隔离管理员Free100耗尽失败；runtime57b0ac9只给该fixture有限200并保留普通Free100、移除Run冒用Interview ID。其两组CI又在业务断言textarea精确可访问名匹配超时；root已加aria-label并39项UI定向通过，尚未推送组合新head或重跑完整远端CI。

题库当前本地候选已接通Interview PG主数据/历史版本、显式同组织保源迁移、独立向量索引/有界重建、初始选题版本/hash透传及Lab真实治理UI；见[架构与迁移](../architecture/INTERVIEW_QUESTION_CATALOG.md)和[录屏准备](../runbook/RECORDING_READINESS.md)。root实际本地API1149/24skip、Web328、types/lint/build、Prisma validate、provider-free Golden30通过；后续39项label定向不冒充另一次全量测试。实际HTTP/PG/Milvus/浏览器helper与恢复资产已接CI，本机无Docker，未执行的新远端链路仍待验收。

当前退出门：精确source freeze/上传→最新push/PR全部CI及原始日志→expected-head合并/远端读回→目标电脑录屏预演。不能在失败head合并，不能把编排/合成45→80宣称模型语义或学习提升。公共跨组织题库、历史题目全部迁移、真实人类校准、模型录屏与生产部署仍未验收。Portfolio助手是另行开发目标，本段不记为实现或完成。下文旧阶段保留作历史，不覆盖本段当前状态。

2026-10-24 latest: PR62 foundation candidate5194edcb passed exact six CI jobs plus independent original logs, merged7e29d768fd7fd0a979ff80915d696f02f14035aa; PR/main/agent-lab/local read back. Only persistence foundation accepted; first-question API/UI protocol remains unconnected and NOT_ACCEPTED. See QUESTION_PRESENTATION_EVIDENCE.md.

2026-10-23 · PRODUCT-REACCEPTANCE-1整体NOT_ACCEPTED。PR59候选43b74cc最新push/PR六项CI成功及独立复核后，冻结合并a03ff8afe7f8431ac6d53c9493f8c22077d23aa0，PR/main/agent-lab均读回。当前唯一主题CANDIDATE-GOLDEN-ENGINEERING，首个阻断I06保存回执本地隔离第五链exit0，待最终复核/最新精确CI，未交付。失败与前置见[GET](../acceptance/TRAINING_READS_EVIDENCE.md)/[安全](../acceptance/IP_ADDRESS_SECURITY_EVIDENCE.md)。

| 优先级 | 范围 | 下一证据/退出门 |
| --- | --- | --- |
| 限定完成 | 仪表/覆盖口径对账 | 修正过期PR40/API82/986口径，保留988最终NOT_ACCEPTED与全部失败历史，独立审文档、对应CI |
| 限定完成 | TRAINING-ACTIONS / I13/I14子集 | PR57六项精确CI通过，冻结合并97e44a2，远端main/agent-lab一致；非I13/I14整行通过 |
| 当前单主题P0 | I06简历保存回执 | 本地32/API841/Web284/实际上传与严格恢复exit0；四轮失败保留，待最新精确CI及PR冻结合并 |
| P0 | 完整候选黄金链 | 简历→岗位→成功SSE→报告→训练→复测完整链，合成工程和真实模型质量分别证明 |
| P0 | 全运行时状态 | 990静态模板逐项展开空/单/多、条件、错误、键盘、1440/768/390；无全分母不报覆盖率 |
| P0 | Lab剩余业务与完整B1 | 录制/实验/决策/审计/数据集/候选/评测/发布逐状态双证据；信封/事件/能力与替换合同，不以空Registry代替消费 |
| P0 | 真实质量与账单 | 先核历史未知账单/额度，单次≤0.5及新测试累计≤3CNY有界评测；失败不发布，未知不记零 |
| P0 | 部署身份与恢复 | 固定SHA/镜像/迁移/配置、当场备份与目标环境恢复，不继承隔离恢复为生产证明 |
| P1 | 工具/知识/记忆及Bridge恢复 | B2–B5退出门、会话级快照、策略/遥测分离、孤儿Run持久恢复 |
| P1 | MCP/管理员控制 | 进程外持久化/多实例、逐服务协议与执行、持久授权审计；所有者按SOP逐目标授权 |
| P1 | 历史16题复用 | 组织/embedding来源确认→保留源迁入/持久收据/读回/浏览器，禁止跨租户fallback |
| 限定完成 | 训练POST超时/断线 | PR58最新六项CI作业成功，冻结合并e108a68；保留首轮依赖下载慢导致CI期限取消，非全训练操作60秒 |
| 限定完成 | TRAINING-READS：成功后refetch/初始GET | 13读取红测后最小修复，PR59最终双证据/六项CI与独立复核后合并a03ff8a，非整体训练通过 |
| 限定完成 | TrainingPage岗位加载错误 | 已复现并修复错误/空状态顺序，仅GET重新加载；随TRAINING-READS限定验收合并 |
| P1 | 训练读取逐字段合同 | 本轮仅拒绝非数组外层；岗位/推荐条目缺失或错误字段的运行时校验与用户恢复需另立实际失败用例，不推广为完整响应语义通过 |
| P1 | 其他异步/错误边界 | 简历上传、HITL、多页面实例共享store等按实际源码重现后独立修复；不由已修历史/结束推广全部安全 |
| P1 | CI运行时维护 | 本轮GitHub注记Actions Node20弃用与ubuntu-latest迁移；独立核升级兼容性，不在训练修复中顺改或弱化检查 |
| 限定完成 | SECURITY-IPADDRESS | SDK→limiter→ip-address最小pin10.7.4，安装链红绿/审计/最新完整CI与独立复核后随PR59合并，保留原braceshigh与所有失败 |
| P1 | 安全维护 | 延续审计/补丁完整性，保留high边界，不声明零漏洞 |

已关闭的限定子缺陷：PR49–55的SSE生命周期、历史跨路由/同会话消息/确认并发、结束回执/跨路由/正文超时；不再作为未复现P0重复列出。其他简历/report并发与完整成功黄金链仍待验收。

交付门：匹配主题验证与独立双证据→定向提交推送agent-lab→最新精确push/PR可见CI全绿→冻结head经PR合并→核远端结果。GitHub重置先读状态恢复，未知POST/PUT不盲重放；不重跑已过不变检查。

无关历史费用失败报告、旧截图目录、旧TASK-034保持现场不提交。全部旧阶段失败/合并/历史TODO原文见[快照](archive/reacceptance-2026-10-22/README.md)，更早历史见[旧归档](archive/reacceptance-2026-10-18/TASKS.md)。

当前源码发现、未扩大本轮修复：FULL_SIMULATION原唯一题干skill缺失已复现并本轮修复，完整工程链本地通过待精确CI；无/歧义匹配仍保留null，历史空值不回填；Milvus简历limit先于客户端排序，不能保证全局最新版本；部分调用将简历读取异常吞为[]，需单独失败语义验收。直接embedding未走统一网关/账本，当前合成调用统计不能当完整成本计量。

PR60 limited-complete: frozen79ce42e, latest push/PR six CI success and original-log review, merged2758f718d0de1e2cfb31f912c9e3eef93a72185c; PR/remote main/agent-lab/local readback equal. Supersedes pending-CI wording. Overall NOT_ACCEPTED; next active subtheme is full successful golden-chain contract audit.

源码对账后续：ARCHITECTURE_MAP/DECISIONS仍含旧阶段待CI措辞和Bridge可选失败描述，需按已合并证据逐段校准；本轮不以这些旧段代替现码。当前技能归属红测已补跨会话父题阻断并最小修复，新30+原4=34通过，新镜像待实际复验。

黄金链源码边界：end在复用existing FINAL后仍执行memory.memorize且画像含新endedAt，可能产生额外embedding；正式报告幂等不能宣称所有结束调用零模型/费用，待单独实测与有界幂等修复。

P0首轮问答语义（实际红测exit1已独立复核，持久化基础服务在工作区，尚未接Controller/UI）：start/confirm未初始化并展示真实任务题；processMessage首轮才初始化队列并无条件completeTask(userInput)，因此“开始面试”可能被计作未展示首题的答案。固定答案黄金工程链不能证明首题展示/问答对齐。后续独立产品合同与红测处理，不在技能归属中顺改运行协议。

P0复测展示语义：实际新浏览器新FINAL之后Training仍显示“复测进行中”；当前后端仅RETEST_STARTED关系状态未表达新面试完成。该断言只核当前关联保留，不算该文案产品验收；须定义已创建/进行/完成/失败标签及报告入口，不能将本轮工程循环推广为所有展示正确。

PR61阶段最终已冻结合并55230237f2ab7eeea7c4224577d2aee0dac8ba6d：最新精确push/PR六项success、两组原始日志复核，PR/main/agent-lab/本地均读回。上方待CI措辞由此收据替代，详细见技能报告。唯一下一主题FIRST-QUESTION-PRESENTATION，先真实红测与合同设计，未新实现；整体NOT_ACCEPTED。

PR62 final limited foundation gate: candidate5194edcb passed exact push39974325503/PR39974398837 attempt1 six jobs and independent original-log review; merged7e29d768fd7fd0a979ff80915d696f02f14035aa at2026-10-23T18:32:14Z. PR/main/agent-lab/local read back. API/UI first-question protocol remains unconnected and NOT_ACCEPTED. See QUESTION_PRESENTATION_EVIDENCE.md. Final merge receipt is post-freeze working-tree documentation.

FIRST-QUESTION-PRESENTATION integration prerequisite, source checked only (not a new reproduced concurrency failure): Lifecycle.end uses total message emptiness, which becomes wrong after assistant-only presentation; EvaluationService.beginFinalEvaluation unconditionally sets non-SUCCEEDED/DEGRADED runs RUNNING after upsert, so the current idempotency key alone does not exclude concurrent model dispatch. Reuse EvaluationRun CAS/parent Interview coordination and add actual zero-answer/end/claim race tests. Queue initialization can call embedding/rerank; retain published-policy and quota admission when moving it into confirmation. These caller gaps are not fixed by the merged provider-free presentation store.

Current FIRST-QUESTION-PRESENTATION WIP: protocol integration is written but unaccepted; validate current private run, actual first/subsequent displayed-question API/browser, saved-bank consumption and unknown recovery, then full relevant gates/exact CI before PR. See CURRENT_STATE; no overall acceptance.

Question-bank selection follow-up (not accepted by this phase): initial saved-row reuse currently requires tenant+role-category+level and prefers exact position inside a bounded100-row window. Free-form topic categories, legacy16-question ownership/transfer and broader semantic selection remain unresolved; do not describe the narrow stored-row contract as reuse of every historical question or retrieval-quality acceptance.

FIRST-QUESTION-PRESENTATION limited local freeze approved independently: source/type/build/lint/diff, API883/21+SSE11/Web307, direct-businessPG45 and combined scoped Lab/policy/UNKNOWN+golden/strict restore evidence passed. Exact candidate CI/PR merge remains next; not global acceptance or deployment.

2026-10-24 PR63 release blocker: exact push40048015400/PR40048049704 failed browser dependency install on Ubuntu26.04 and new production advisories. CI prerequisite in progress; no merge/acceptance. Independent Zod installed-chain red72/green28 retained; minimal patches and full new-lock verification pending. See CURRENT_STATE.

2026-10-25 readback: security prerequisite complete default private API93/store45/Lab+policy+golden/strict PG+Milvus+Qdrant runner and separate transfer storage both exited0. New-lock API1011/21skip plus final Zod126, Web307, type/lint/images pass. Final independent review/new frozen-head CI pending; PR63 remains unmerged and whole product NOT_ACCEPTED.

2026-10-25 final PR review found a missed normal branch: fresh confirmation publishes an assistant question but local messages remain empty; the old sidebar abandoned via navigation without POST/end. New component red3/original34 passed, then minimal fix37 passed. Empty-message confirmed exit now uses end with a no-report label; confirming blocks exit. Root added real browser/API/PG cascade and refused/malformed receipt checks (no answer POST). New Web full/image/default browser verification is pending; earlier complete default pass does not cover this new branch. UI inventory only existing exit nodes UI0266/268/269 are source-reconciled; all990 baseline verdicts remain NOT_ACCEPTED and other nodes retain old baseline.

2026-10-25 final local freeze gate achieved: fresh-confirm red3/green37, Web310, durable full default ALL private exit0 with actual new no_answers exit/PG cascade and strict PG+vectors restore; independent original-log review approves related local freeze only. New exact candidate CI/PR merge pending; overall NOT_ACCEPTED.


2026-10-29 EVALUATION-QUALITY-P0 (in progress): user authorized priority implementation. Add bounded business assertions and v6 scoped publication, shared production scorer calibration contract, reject failed/unknown report evidence, correct heuristic provenance, all-trial budgets and durable unknown submission receipts. Necessary Hono audit prerequisite and exact new-head CI pending. Next: independent annotation/adjudication and real Interview quality tasks, Case/evaluator dual evolution and snapshots, then online inspection. No whole-product/model-quality/deployment acceptance. See EVALUATION_QUALITY_GATE_EVIDENCE.md; earlier PR63-open status is obsolete, merged baseline deaf006.

2026-11-03 Portfolio97af5cb六项CI与原始HTTP137/Redis/恢复日志通过；实际浏览器发现HTTP预览WebCrypto缺失已补安全前置提示，站点27测试通过，最终client追加提交待精确CI。历史正文凭据已脱敏，原始未净化中间提交未上传。
