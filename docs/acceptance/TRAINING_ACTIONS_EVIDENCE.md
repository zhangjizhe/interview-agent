# 训练完成与复测动作验收

2026-10-22；基于 agent-lab/main `5c6ecdc3f7dba484c89dc3db009237911201e9b4`（最近产品代码PR55）。当前 **LIMITED_ENGINEERING_ACCEPTED / CI_PASSED / MERGED_PR57**，不是完整产品、模型质量或部署通过。

## 产品合同与源码核对

范围仅 I13/I14 的 TrainingPage 完成、复测和更新建议动作。复用现有 React Query、TrainingService、startInterview、UsageService；不改变架构、数据库、API、权限、额度或模型路由。

- READY 完成：等待时互锁，成功回执必须包含非空Attempt ID及当前recommendationId，随后重新读取建议。失败保留上下文并提示核验，不自动重试。
- COMPLETED 复测：发送当前岗位/技能/推荐；仅成功HTTP及匹配Interview ID、岗位、技能、模式回执后导航。空或错误回执不得导航；未知结果不能解释为服务端未创建或退款。
- 所有三个动作共用同步互锁；等待时按钮禁用。岗位ID或profileVersion变化/卸载后旧响应不显示错误、不导航、不解锁新动作。刷新失效使用提交时岗位ID，避免闭包读到后续岗位。
- 完成不提高技能分；复测创建实际Interview并关联TrainingAttempt，产生一单位INTERVIEW_START。后端start查询Milvus简历、校验岗位/技能/额度，失败关联时补偿Interview与用量；此路径源码未发现LLM/embedding调用，实际费用边界另以隔离计数验证。

## 本轮已运行

- 初始实际页面回归：修正每个重复请求必须持有独立Response的测试后，旧页面3项失败且无未处理异常。原先共用Response导致的Body already used是测试错误，不计产品缺陷。
- 新增刷新/动作互锁的两项组件场景在修复前也通过，不能声称它们复现了旧实现竞争；共用同步锁是源码审查后的防护。
- 当前TrainingPage动作9项与原空建议1项通过；Web完整24文件255项通过，页面/测试eslint与Web typecheck通过。测试覆盖重复点击、等待禁用、503后显式重试、成功复测导航、空/错误身份回执与岗位版本改变后的旧响应。
- 测试过程中刷新请求计数早于mutation异步启动、岗位缓存通知尚未渲染就释放旧响应造成失败；补等待可观察状态后通过，不把这些测试时序错误写成新的产品缺陷。
- Web隔离镜像已构建（config `70d3c4fc2f74189c6561db99778011d3bf733f3869098eaad2f8245189a91b06`）。第二条隔离链日志已包含API93、Lab及候选浏览器、训练动作、PG严格恢复和真实向量恢复的最终成功标记；独立Agent已核共同锁/版本保护及测试fixture合同。精确候选两套对应CI现已完整成功，见下文；已按冻结SHA经PR57合并，见下文。

## 隔离验收运行记录

首次沙箱Docker socket拒绝在产品运行前发生；授权沙箱提升后首条真实链API93、Lab与既有候选回归通过，训练完成/复测真实请求及PG关联/唯一复测/一单位INTERVIEW_START核对已到达。随后浏览器路由已切换但确认面板异步加载尚未完成，立即isVisible断言失败，整链exit1，未到最终严格恢复；不得将中途成功提升为完整通过。测试改为先等待确认按钮真实可见再保留原断言，产品未变，第二条完整链日志已到最终恢复成功标记；原工具会话在Agent额度中断后不可读，未取得该进程exit读回，因此不虚构exit0。后续精确候选push及PR CI均完整success，补足完整执行证据；本地原exit不可读的事实仍保留。

## 静态清单与边界

TrainingPage原29个native/router节点按AST顺序/tag/component核对，保留所有既有ID/review/evidence/verdict，仅更新行/表达式/属性；新增错误提示UI-0988保持NOT_ACCEPTED。总988模板（180交互/808展示），全部最终NOT_ACCEPTED；这不是运行时覆盖率。

隔离fixture直接种合成FINAL证据再走实际聚合和产品HTTP，不证明真实模型报告或用户能力提升。真实模型历史13/36、已知0.069285CNY另有未知账单边界不变；本阶段不调用外部模型。未部署，不迁移历史业务题，不改变管理员授权。

本阶段未覆盖训练complete/start/refresh响应头或正文长期挂起、断线后的未知结果恢复，也未展开全部键盘/响应式状态；不得将本批互锁/已返回失败合同解释为全部训练状态通过。

范围外发现：TrainingPage先判断无activeJob再判断jobsQuery错误，岗位GET失败可能展示“请先设置当前目标岗位”；另列待办，不在本次顺带修复。

第二链实际验证：浏览器更新建议、逐字段核skill/objective/reason/prompts，注入503后保留上下文并显式重试；持有实际完成/start的201回执时按钮互锁；PG唯一Attempt、完成前后score40不变、唯一复测Interview的owner/org/job/profile1/skill/mode/status及一单位INTERVIEW_START均核对。回执释放后进入简历确认面板，再回训练页读到RETEST_STARTED与实际关联。训练段chat/embedding/rerank/externalRequests均无增量；清理仅本fixture资源与已核用量收据，恢复原activejob，再过父级基线与严格PG schema/行多集/sequence及实际Milvus题目/Qdrant向量payload恢复。

## 精确CI与合并状态

候选 `e56564a39b47d67479e9ffc0788446c846140ff8`：push [39763227597](https://github.com/zhangjizhe/interview-agent/actions/runs/39763227597) 与PR [39763334380](https://github.com/zhangjizhe/interview-agent/actions/runs/39763334380) 均完整success，含审计、全lint/type/API Redis/Web、缓存/数据集合同、PG安装升级、三端构建、题目存储与完整隔离浏览器/恢复门；PR watch exit0。限定训练动作工程门通过，I13/I14整行、988模板最终verdict及整体仍NOT_ACCEPTED。

历史阻塞记录：[PR57](https://github.com/zhangjizhe/interview-agent/pull/57) 首次冻结head合并PUT连接重置，后续API读取持续reset；Git最后读回main仍5c6ecdc、PR head/agent-lab仍e56564a，公开PR页Open。当时未确认合并，未写交付或部署；后续已恢复合并，见下条。保留禁止盲重放未知写入或直接push main绕过PR的规则。

2026-10-22后续恢复：先确认PR57仍open、头e56564a与base5c6ecdc未变，重新读回全部六项检查completed/success，再冻结SHA合并成功（merged=true），提交97e44a2c6b579115f2de3aa918dc254880c2b327。远端main/agent-lab均读回该SHA，本地快进。后续PR只读又reset，成功合并响应及独立Git分支读回均已保留；未重新运行不变产品测试或付费模型。
