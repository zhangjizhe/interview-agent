# 待办与验收门
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
