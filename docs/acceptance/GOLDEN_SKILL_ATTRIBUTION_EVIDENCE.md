# 完整模拟技能归属：成功黄金链首个实际断点

2026-10-23，基线PR60合并2758f718d0de1e2cfb31f912c9e3eef93a72185c。当前单主题属于CANDIDATE-GOLDEN-ENGINEERING。限定合成工程API/浏览器成功管线及恢复已本地通过，尚待最新精确CI；完整候选产品/质量仍NOT_ACCEPTED，首题展示语义P0未解决。

## 原始实际失败

私有Docker网络、真实Nest/PG/Redis/Milvus/Qdrant、仅loopback合成provider，显式FIXTURE_GOLDEN_PROBE=1。真实注册独立用户、API创建Frontend岗位/React与TypeScript JD、真实TXT上传/确认、FULL_SIMULATION、默认multi LangGraph成功SSE。实际消息/答案唯一，AnswerHistory精确0.45，实际结束产生Report指向FINAL/SUCCEEDED及一条Evidence；没有seed正式报告或技能。

golden-actual-probe实际exit1：Question.skillId与Evidence.skillId均空，CandidateSkillState=0，在要求完整模拟证据具有技能归属处失败。无完整恢复通过结论。源码确认ensureQuestionRecord原来只从context.practiceSkillId写skillId；FULL_SIMULATION没有practiceSkillId。额外核对英文Frontend标题在categoryForPosition原来不匹配中文前端而回退agent，可能出题与JD不符。

## 最小修复及安全/成本边界

- 共享既有job-keywords-v1词典，不改岗位要求提取逻辑。题目归属只看真实question文本，与当前owned targetJob/profileVersion的active技能要求求交；Latin词边界防React被reaction等子串误命中。
- actual Interview的user/org/mode/job/version与当前active Job再核验；不信任务context伪造mode/practice。requirement组织/岗位一致，skill有效。FULL_SIMULATION唯一明确命中才赋skillId；无匹配或歧义保持null，不取JD第一项或按宽泛capability硬映射。
- SKILL_PRACTICE保留actual Interview受控技能且核当前岗位要求；metadata覆盖实际mode/job/version/practice，避免伪造选择信息。新增selectionMetadata.skillMapping记录版本、理由、候选与命中词；已存在规范题不重写历史。
- 明确英文frontend/front-end/front end、backend/back-end/server-side兼容，保留原Agent优先和中文规则。未知岗位不借此证明覆盖。
- 无schema迁移、不新增模型调用；每个首次规范化的有关联岗位题目增加两次范围限定数据库读取。旧版本/停用岗位/未知技能保持未归属，不假造正式证据；历史空skill证据没有自动回填。

## 已实际验证 / 待验

独立新25项旧码红20失败/5已有通过，真实exit1，无初始化错误；最小修复后新25与原持久化/追问4项共29通过exit0。下文保留后续34项/API871与实际探针收尾证据，早期“待验”描述为当时状态。

## 私有模型工程合同

新增golden-model-contract纯函数识别实际supervisor/planner/reviewer、回答评分/report/个性题模板，未知或歧义请求拒绝。显式baseline=0.45/45、retest=0.8/80只是固定工程输入，不能证明提升。默认profile=null保留原fixture响应；内部切换不清stats。实际原生OpenAI SSE发送两个token chunk、finish/usage及DONE；9项纯合同和1项真实loopback HTTP协议测试通过，外部模型调用0。不以合成总分、启发式回退或SSE完成替代正式评价/真实质量。

工程退出合同：原FULL_SIMULATION探针不得改practice或seed正式证据；实际训练推荐/完成不增分、唯一关联复测及新FINAL/可比聚合，浏览器与API/PG逐项对照，再严格恢复、最新精确CI和PR冻结合并。原始probe只到FINAL/skill断点，后续扩展结果分别记下，不倒填早期运行。

## 修复后的实际 API 结果

独立对抗补5例时30项29通过/1失败，复现跨面试followUpFrom父题关系；最小限制parent.interviewId与当前task一致后，新30+原4=34项全通过exit0。新增未知taxonomy、同skill重复去重、adapter忽略owner条件、追问按自身题干匹配、实际practiceName覆盖等二次复核。全API100套/871通过21跳过exit0，最终新镜像question-skill-final构建exit0。

原失败实际FULL_SIMULATION探针golden-skill-fixed-probe实际exit0：真实多Agent成功SSE/唯一Answer/score0.45、实际FINAL及Question/Evidence非空skill、state1、严格PG和实际Milvus/Qdrant恢复均通过；首次exit1保留。

扩展golden-training-api-loop实际exit0：真实弱FINAL→推荐（sourceRun/Evidence对照）→两次完成返回唯一Attempt且无模型/分数变化→关联practice复测→真实SSE/score0.8、新FINAL、同技能聚合62.5/trend35/evidenceCount2→重复结束复用正式报告/证据/Run不增量，旧Evidence保留；严格PG及实际向量恢复通过。固定45/80只是显式合成输入，不是训练效果。

重复end实际记忆embedding增量1，chat/rerank/external无增；该边界源于每次结束仍归档含新endedAt的画像，列TASKS，不将正式报告幂等推广为零模型成本。之后增强探针要求精确React requirement ID、frontend类别及mapping版本/理由/词，已在最终完整本地链执行；上列早期非空skill结果不倒填为增强断言。

新增独立浏览器真实注册/岗位/上传/完整模拟/报告/训练/复测/刷新重登录链已本地执行。CI新增私有provider合同与显式golden probe门，最新候选CI尚未完成，不声明远端阶段交付。

首轮语义边界：本轮固定答案只证明管线。源码start/confirm没有先展示任务题，processMessage首轮初始化后即completeTask(userInput)，首轮问候是否误计答题须另立真实失败用例；不得用当前固定答案循环宣称完整候选问答设计已验收。静态990模板及I06–I14整行仍NOT_ACCEPTED。

## 最终本地完整收据与独立复核

独立Agent实际读取golden-browser-full-chain.exit为0及同名原始日志：113行实际注册/岗位/上传/FULL_SIMULATION/默认multi成功SSE与唯一答案；114–115行Question/Evidence技能及状态；116行重复结束实际embedding增量1；117行真实训练API全环；165行独立UI全环；261行PostgreSQL完整schema/行多集/sequence恢复一致；264–265行实际Milvus题目与Qdrant向量/payload恢复及隔离恢复收尾。未以局部PASS代替完整退出码，初次skill缺失exit1及foreignparent对抗红均保留。

golden-interview-loop.mjs使用新browserContext、仅localhost5177路由，关键写入全部走产品UI：实际注册登录、岗位表单、TXT、完整模拟/确认、Control+Enter回答和原生成功SSE、结束报告、刷新建议、完成训练、关联复测、新SSE/报告、刷新退出重登录。并非route mock成功，不经检查脚本seed报告/Evidence。fixture-golden-inspect仅在明确私有PG下读取限定synthetic-golden-browser用户资产，及loopback profile切换；不输出JWT/密码/hash。合成资产留该唯一网络供最终dump/restore后销毁，不宣称生产业务清理。

双证据核对精确React当前岗位要求ID、frontend类别、词匹配版本/理由/候选与词；Question→Answer→Message及唯一reply关系；FINAL/SUCCEEDED和Report当前Run；Evidence逐答案及同技能；报告四维DOM对真实API、PG report.id/overall/scores；推荐sourceRun/evidence及卡片objective/prompts/reason。完成训练比较PG技能状态和provider stats不增，复测唯一Attempt关联、两次INTERVIEW_START各1单位；新正式证据得出62.5/trend35/evidenceCount2且旧Evidence保留，重登录实际读取保持。

这些分数来自明确baseline/retest fixture参数45/80，既不证明回答题义正确，也不证明学习提升或真实模型质量。模型调用实际发生，外部请求0不等于零模型工作；原重复end embedding+1仍保留成本待办。独立Agent源码复核确认：Page空态仅“开始你的第一句话吧～”，confirm不自动出题，题目直到首消息才初始化并进入同次completeTask，首题先展示/问候不得记答题的产品P0仍未验收。本阶段仅批准限定合成工程证据，整体NOT_ACCEPTED、未部署，必须等待精确候选push/PR全部CI并冻结合并。

额外展示缺口：新FINAL后实际Training仍显示“复测进行中”，对应RETEST_STARTED关系状态；本轮仅验证关联保留，不批准该文案语义。列TASKS后续产品合同，整体不交付。
