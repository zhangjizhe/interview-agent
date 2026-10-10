# 当前任务

更新：2026-10-08 · PRODUCT-REACCEPTANCE-1

## 用户要求与交付门

用户要求全部功能重新严谨测试，先明确产品规划，每个交互和展示二次确认，测试确认后才交付。执行API/持久化与浏览器独立双证据门；不以旧测试数量、readiness或mock结果声明全链路通过。

## 当前阶段

Phase 0 验收清单完成，产品整体 NOT_ACCEPTED。计划见 `docs/acceptance/PRODUCT_REACCEPTANCE_PLAN.md`；源码清单 `UI_INVENTORY.json` 更新为ea4f68f基线980模板项（178交互/802展示），旧673项归档，全部未验收，运行时仍需条件/动态/响应式展开。34个功能级合同含完整训练、管理员控制面、数据展示、故障恢复与费用边界。已确认产品规格陈旧、CI无浏览器门和旧全流程脚本合同过期。

用户已于2026-10-08要求自主连续推进，覆盖每Phase等待要求；下阶段为校准规格、独立合成环境非付费真实API与浏览器逐项测试及修复。真实AI阶段先核对额度/账单并明确新有界预算，不能绕过已记录的费用门。用户已继续并扩展范围至自定义 Agent、真实编排、题库与 MCP；授权独立测试 Agent。基础阻断阶段修复与隔离测试已通过，相关API42/组件6/镜像43和浏览器双证据完成；下一阶段Agent配置/受控执行自主推进中，不修改业务权限、不运行付费模型。产品合同见 `docs/acceptance/LAB_AGENT_WORKFLOW_CONTRACT.md`；每阶段通过后自主进入下一阶段，整体仍 NOT_ACCEPTED。

## 2026-10-09 当前推进

已合并并部署Agent编排批次PR #5（main 8aae6bb）；业务数据库现20迁移。题库Gateway计量/20迁移/CI浏览器批次68ac78c已推送，push CI37901603421全绿，PR #6最新CI全绿已合入main bb11d435；20迁移已部署。独立审计发布闭环按ADR23修复，完整API744/组件116、实际HTTP80/80、单Agent/工作流60合成评测样本及首次发布、浏览器11导航/退出登录和最终严格恢复通过。首次原始SQL差异快照丢失、根因未知；新比较器独立13及真实PG字段/重复/结构/序列损坏拒绝通过，不隐瞒首轮失败。发布批次已完成lint/type/build/diff、最新CI及PR #7合并核验；当前继续逐项双证据。

本阶段外部付费0，历史未知账单不记零。用户预算单次≤0.5CNY、发布前新测试累计≤3CNY，禁止盲目重放。整体NOT_ACCEPTED，34功能合同/全部动态与响应式UI、真实质量及生产验收仍未全部完成。报告见QUESTION-GATEWAY及RELEASE-CLOSURE。自主连续推进，每2小时验收重要进展通知，合格批次才合并main。

已提交发布闭环ea4f68f并核验远端，PR #7最新CI全绿并合并main 66f91bd，本机部署20迁移及刷新会话确认。当前清单补齐13个页面/组件含新增编排/首发，980模板全部NOT_ACCEPTED；按当前源码与运行状态逐项匹配双证据，不把阶段测试通过当全模板通过。

2026-10-09增量验收：PR #8最新CI37939851039全绿并合入main e7745aae；控制中心真实API字段/两个快捷入口/11导航活动态新增浏览器断言经独立复核，完整隔离HTTP80/80及浏览器/严格恢复退出0。首轮浏览器路径缺失已如实记录，重跑通过。13个模板登记限定PARTIAL证据，最终仍NOT_ACCEPTED；报告见 `docs/acceptance/LAB_OVERVIEW_EVIDENCE.md`。新测试5a9fe42的push CI37941329046及PR #9最新CI37941403045全绿，已合入并核验main 3eb2ccd5ff812a0af8ea8fdb08d8356691529784，agent-lab已快进同步；外部付费0。下一组为控制面503/重试与MCP重载确认的限定浏览器证据，不重跑未变更已通过的检查。

2026-10-10：控制面503浏览器代理注入保留原会话、真实profile200、重试恢复且无新登录；MCP取消无POST/确认一次真实POST/执行中禁用/反馈及绑定保持，隔离HTTP80/80和严格PG/向量恢复通过，独立测试Agent复核通过。未证明自然API503或MCP重载失败，整体NOT_ACCEPTED，外部付费0。用户要求旧题复用：只读发现默认question_bank_v2有16条、当前组织集合空、历史面试题PG为空；未检测测试标记，但旧无归属字段，等待确认允许复制目标。拟受控迁移保留源/直接复用已有向量/同指纹幂等/Strong读回，不跨租户fallback。

2026-10-10定期核验：PR #10 head33f2567的push CI37983669698和最新PR CI37983695999全绿，已合入并核验远端main abbd072fd7fa56106c42117713baa4b7d441b1e6；agent-lab快进同步。无业务代码变更，未重复已通过链路、未调用外部模型。旧题16条归属复制确认仍待回复；不将这一前置扩展为全部验收阻塞。

2026-10-10旧题复用准备：新增无网络/写入的纯迁移预览校验器，字段UTF8上限、1024维有限float32向量、完整指纹、重复/冲突拒绝、同内容跳过。独立测试Agent新增9项对抗，补float32溢出后20/20及语法/diff通过，CI接入。实际旧集合只读16/16兼容，来源指纹4ee5d53ef75c0a31ff52ba37f7c7c947b49822d78016565c677542c6b06efacf；目标仅假设空集合，未证实模型来源/归属/真实迁移。源未改、外部调用0；复制归属待用户回复。整体NOT_ACCEPTED。

2026-10-10继续推进：PR11最新CI38006773004全绿合并main 487bfc0ab8dc5309b770bcbd2c18331736bfbdd8并核验远端。新增迁移executor adapter初版，合计27测试通过；尚未独立审计/真实Milvus验收/提交，不得用于业务复制。当前待审并发排他与身份/模型来源证明，旧题归属确认仍待回复。无外部模型费用。

迁移执行器库阶段：独立审计发现并发重复和目标既有数据丢失两项红测，已修复为整个读计划写回读持目标排他锁、冻结快照、完整预期并集指纹核验。独立32/32通过，增加审批人/批准ID/任务ID收据强制字段后33/33；无公开API或业务执行器入口，真实adapter跨进程锁/普通写入协调、Milvus Strong回读、授权/embedding来源仍未验收。仅库合同阶段，不代表迁移功能交付或整体通过。业务旧16条未复制，外部模型0。

2026-10-10 SDK桥接阶段：Strong=0/1001读取上限/拒绝超量与假空/插入全量ack+PK校验/flush确认/源写禁用；独立审计新增稀疏、重复及超int64主键3红测，修复后累计43/43、lint/diff通过。实际SDK只读Strong旧16条通过，未复制业务题或写入SDK验收，不证明真实锁/审批/model provenance/真实迁移完成。PR12 head ff02020最新CI38013238845全绿；GraphQL连接重置后REST核实开放并成功合并，核验远端main 32d9c8ab580760d8ce6a4f189398b65fa204087b，agent-lab快进同步；后续SDK批次新head需重验CI。新模型费用0，整体NOT_ACCEPTED。

今晚内部预发布验收材料已整理并经独立复核，入口 `docs/acceptance/PRE_RELEASE_REVIEW_2026-10-10.md`；只核验限定阶段证据，不把签字变为整体交付批准。

当前远端agent-lab head23c7db2；最新CI/PR13因连接重置未核实，不合并。下次先精确核验，再继续隔离迁移及逐项双证据；旧题归属和真实模型费用前置保持。

2026-10-10 16:07 阶段合并核验：网络恢复，PR13精确head23c7db281262ecc8eb4b56cb83142280908f4912的ci-summary/docker-build-test/lint-type-test均completed/success；REST按该SHA合并成功，远端main核验1d811487053d8600061e103c890a27a7d9e2292d，本地agent-lab快进同步。远端agent-lab仍23c7db2（后续合格批次再推送）。阶段仅SDK桥接与内部验收材料，不表示真实题库复制、模型质量、全UI或生产验收通过。未重跑未变更测试、未写业务数据、模型费用0；整体NOT_ACCEPTED。

2026-10-10 18:07：独立测试Agent复核真实隔离迁移下一阶段方案，见QUESTION_TRANSFER_PREVIEW.md；共享锁/持久收据/schema及短隔离SDK写入验收仍待实施，无业务写入或模型调用，整体NOT_ACCEPTED。

2026-10-10 20:08：新增短私有Milvus/etcd迁移存储harness，首轮及两次诊断flush限流失败如实保留；按0.1/s预先限速不重试后基础/独立增强版均退出0。真实SDK并集/幂等/源B不变、授权及冲突零insert、丢弃真实ack为UNKNOWN并新任务Strong核对恢复通过。仅单进程hook/内存收据，不证明共享锁、持久收据、API/浏览器或业务16题迁移；外部模型0，整体NOT_ACCEPTED。CI接入，精确新head通过后才合并。证据QUESTION_TRANSFER_STORAGE_EVIDENCE.md。

存储限定验收提交52a4c97102c5fb46e390ed64e4556848d5bfce32已推送并核验origin/agent-lab；PR14已创建并附到聊天。精确head check-runs读取连接重置，最新CI未知，未合并。下一轮先核验PR14精确最新CI，绿后方合并并核验远端。此状态暂存本地。

2026-10-10 22:04：PR14精确head52a4c97102c5fb46e390ed64e4556848d5bfce32的push/PR六项checks均completed/success；按冻结SHA合并成功并核验远端main a5a8610ff3e104928aad42dad171c54e78092b07，本地agent-lab快进同步。真实隔离存储测试已进入CI门禁；不代表跨进程锁/持久收据/产品页面/业务旧题迁移验收完成。整体NOT_ACCEPTED，未重复已通过检查，无业务数据写入或模型费用。后续优先真实共享锁与持久收据合同，旧题归属/embedding来源和历史费用前置保持。

2026-10-11 00:07：隔离PG跨进程锁/持久收据增强harness退出0，实际两个Node进程在同目标锁等待后串行，insert2/skip2、无重复、PG新连接读回PREPARED/VERIFIED及UNKNOWN保留；独立审查与语法/diff通过。仅fixture，不证明生产普通写入协调/丢锁fencing/权限/浏览器/业务迁移；外部费用0，整体NOT_ACCEPTED。当前待新提交CI；证据QUESTION_TRANSFER_STORAGE_EVIDENCE.md。

隔离PG增强批次06f7177adf5819aadbfa62ef40a8fe0e3de9006a已推送并核验origin/agent-lab，PR15已创建/附到聊天；精确head四项push/PR jobs为in_progress（无结论），未合并。后续优先核验最新对应CI，全部成功后按冻结SHA合并并核验远端。此状态暂存本地。

2026-10-11用户再次授权验收通过即合并：PR15精确head06f7177adf5819aadbfa62ef40a8fe0e3de9006a的push/PR六项checks全部completed/success；按冻结SHA合并并核验远端main 8c0e364d20a30524545508e0ef8e96dee1820299，本地agent-lab快进同步。此批仅隔离PG锁/持久收据验收，无生产接线/业务题迁移/模型费用，整体NOT_ACCEPTED。未重复已通过检查；后续合格批次遵循同门。

2026-10-11 02:09：题库新增真实API逐字段/浏览器答案开关、搜索清除/岗位过滤、取消删除零DELETE/持有真实删除响应期间禁用/Strong无题双证据；API80/80与完整浏览器/严格PG及向量恢复退出0，独立审查无阻断。18模板仅PARTIAL，累计31，最终980仍NOT_ACCEPTED。证据LAB_QUESTION_EVIDENCE.md；仅测试/台账，无业务题复制或外部模型费用。新headCI通过后才合并。

题库双证据批次75e59c6054df50336886cb3ee3155812a3716bf5已推送并核验origin/agent-lab。gh PR创建GraphQL连接重置，随后REST查开放PR也重置，是否创建未知；未盲目重复创建，未核实最新CI/未合并。下次先查询agent-lab开放PR并附到聊天，核验精确head全部CI后才合并；若确认无PR再创建。此状态暂存本地。

2026-10-11 04:11：网络恢复确认无开放PR后创建题库双证据PR16并附到聊天，head75e59c6054df50336886cb3ee3155812a3716bf5。此前push三项CI成功，新PR两项job in_progress；后续精确checks读取连接重置，最新结论未知、未合并。下一轮核验新PR对应全部checks成功后按SHA合并并核验远端，不重复已通过测试。

2026-10-11 06:30：PR16精确head75e59c6对应六项CI成功，按SHA合并并核验远端main a7ad13f099e766d6b37d375e1a8c4bab5431083c；agent-lab快进同步。新增题目在途冻结六字段/保存/关闭，独立组件旧2红修复11/11、lint/type/build通过。三轮浏览器失败如实保留：实际POST201约2.6s排除后端超时猜测，原因为已填textarea包装label精确定位失败且未处理response拒绝掩盖首错；修正测试定位/错误记录后第四轮API80/80、完整浏览器及严格PG/Milvus/Qdrant恢复退出0。32模板限定PARTIAL，最终980/整体NOT_ACCEPTED。旧16题未复制，外部费用0；新批次待提交及最新CI，绿后才合并。证据LAB_QUESTION_PENDING_EVIDENCE.md。
