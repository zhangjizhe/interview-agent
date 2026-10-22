# 训练 POST 等待超时与未知结果恢复

2026-10-22；产品基线 PR57 合并 `97e44a2c6b579115f2de3aa918dc254880c2b327`。当前 **LOCAL_CHECKS_PASSED / CI_PENDING**；整体仍 NOT_ACCEPTED。

## 范围、合同与影响

本批仅训练 complete/start/refresh 的 POST 响应头及正文读取等待。三个动作共用60秒deadline，覆盖fetch与safeJson；到期中止客户端等待、释放互锁并显示“结果尚未确认，请更新建议后核验”，不自动重发、不解释为后台回滚或退款。岗位ID/profileVersion变化及卸载清理计时器与客户端请求，旧scope不显示迟到错误或导航。

复用现有React Query、safeJson及Interview结束等待中已有的AbortController/60秒做法；补Promise.race覆盖忽略abort的测试输送，保证POST等待拒绝。没有数据库、API、权限、额度、模型调用或部署变化。真实start仍产生一个Interview及一单位INTERVIEW_START；超时不撤销这些写入。

**明确未覆盖**：成功POST之后await invalidateQueries触发的GET长期挂起可能继续保持busy；初始岗位/推荐GET也没有本批deadline。因此不能声称整个操作或所有训练网络请求都在60秒恢复。该GET边界另列后续验收。

## 复现与本轮验证

- 旧页面实际回归：complete/retest/refresh × 响应头/原生Response正文挂起，共6项失败、既有9项通过。推进虚拟60秒时旧页面没有超时提示、互锁仍在；释放有效迟到回执后可能继续动作。不是凭源码预填失败。
- 修复后训练页20项通过：既有动作9、POST timeout6、卸载/同岗版本失效4、原空建议1。超时断言保留未知提示、按钮释放、AbortSignal、一次POST与迟到有效回执不导航；scope清理检查旧503不污染当前页面。
- Web完整24文件265项、最新typecheck和定向eslint通过。新Web隔离镜像构建成功，config `c1313c13d8034075c0539d6cf91109dff67f5d05c13ac260cce81d04b32a6888`。
- 独立Agent只读核POST deadline/正文与scope清理，指出成功后refetch GET边界；本报告按此限定，不弱化断言或称全操作通过。
- 独立浏览器helper接入正常TrainingActions后；将分别持有实际refresh/complete/start的真实201回执，观察原生60秒、实际PG已写入及显式更新后的状态恢复。完整隔离链日志已包含API93、Lab及候选、正常训练动作、三次原生超时及严格PG/实际向量恢复的最终成功标记；独立Agent随后额度中断，原工具exit未能读回，不写exit0。对应精确CI必须完整成功后才允许合并。

UI AST按旧source line/tag/attribute定位30个已有native/router节点（UI-0988为历史追加，不能按JSON数组位置错配），保留全部988个ID/review/evidence/verdict；只更新行/表达式。无新增模板、无运行时覆盖率。

## 成本、质量与后续门

本阶段使用隔离组织与手工合成FINAL证据，不调用外部模型，不冒充真实评分/训练提升。历史13/36真实成功、已知0.069285CNY另有未知、缓存污染无效结论不变；单次0.5/发布前新测试累计3CNY及对账前置保留。真实质量、完整候选黄金链、历史题库业务归属与实际部署仍待完成。

退出门：真实API/PG+浏览器全部、严格恢复exit0、独立复核、定向diff/提交、最新对应push/PR CI全绿、冻结SHA经PR合并并读回远端。未到退出门不得写交付。

实际浏览器记录：refresh 60,021ms、complete 60,149ms、retest 60,092ms后显示未知结果并释放POST互锁；无自动POST或迟到回执释放尝试后的导航。真实201在延迟前已执行，PG唯一Attempt与唯一复测、score40不变、一单位INTERVIEW_START和provider计数无增均核对；显式更新读回COMPLETED/RETEST_STARTED与实际retest ID。浏览器持有整个回执，不冒充仅正文流挂起；后者由原生Response组件测试覆盖。清理限本fixture资源/用量并恢复原activejob，父级严格PG schema/行多集/sequence、实际Milvus题目/Qdrant向量payload恢复最终标记均通过。

运行限制：独立测试Agent两次受额度中断，不能把未读回的本地进程exit虚构成0；不为此无意义重跑已经过且未变更的本地检查。后续长任务须把真实退出码保存到临时文件，避免工具会话过期丢失。精确CI完整结果是本候选下一合并门，尚未部署、未付费模型测试。
