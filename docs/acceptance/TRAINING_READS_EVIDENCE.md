# TRAINING-READS：训练读取与恢复

2026-10-23。基线e108a685f0839f3ad3c7556bcf8818468784e2ac；整体PRODUCT-REACCEPTANCE-1仍NOT_ACCEPTED。本轮仅I13/I14读取子集，本地限定工程验收已过，精确候选CI/PR尚待完成。

## 产品合同与实现核对

岗位GET错误必须与真正空数组区分；岗位/训练建议读取均覆盖响应头和正文的60秒等待，单次失败不自动重试。非数组或成功但坏JSON必须显式读取失败，不能伪造空岗位/空推荐。查询采用TanStack AbortSignal，页面卸载或查询岗位/版本切换取消旧读取，推荐query key包含岗位ID及profileVersion。

读取失败展示错误及“重新加载”，只对失败query执行GET，不调用刷新/完成/复测POST。错误状态不展示旧READY可点击控件，避免成功写入后读取失败诱导重放。成功POST仍按原合同等待推荐invalidate；GET有界结束后释放动作锁。有效复测创建回执在有界读取完成后仍允许导航：读取失败不撤销已经确认的面试创建，该导航分支目前只有组件证据，独立浏览器本轮限定完成训练后的读取恢复。

本轮复用TrainingPage/useQuery/requireJson及现有隔离验收能力，没有更改API、数据库/schema、归属权限或用量合同。SkillProfileController.listTargetJobs按req.user.userId查询；TrainingService.list按userId与可选targetJobId查询。GET不调用模型；取消客户端读取不取消服务端动作。

## 本轮实际组件与构建证据

- 前12个新增实际TrainingPage用例，对原基线执行全部12失败、真实exit1；保留初始5失败及计时测试修正后完整基线日志，失败未删除或记通过。再发现并实际红测跨页面共享query键复用无界请求：新增第13项在中间实现1失败/12通过、exit1；以target-jobs/training子键隔离并保留settings前缀invalidate后，最终全Web25文件278项通过，真实exit0。
- 覆盖岗位503和仅GET恢复、两类非数组成功、两类头挂起、两类正文挂起、完成/刷新/复测成功后GET挂起无POST重放、卸载/同岗位profile切换旧读取取消。计时用例采用fake timer，不声称原生60秒浏览器。
- Web build包含tsc及vite通过，实际工具exit0；页面/新增测试eslint通过；e2e显式--no-ignore检查通过。初次普通eslint对e2e发出ignored警告，随后显式检查，未把忽略视为检查通过。
- 库存对照基线AST保留988旧ID、review/evidence/verdict及无关条目；新增错误p与重新加载button为UI-0989/UI-0990，990模板（181交互/809展示）最终仍全部NOT_ACCEPTED，不是运行时覆盖率。

补充：同岗位profile变动单测更新原setQueryData的实际目标key，保留原迟到动作断言；不更改其他页面读取合同。数组校验仅校验外层，不声明逐字段语义完整。

临时本地证据：training-reads-baseline-full.log/.exit、training-reads-web.log/.exit、training-reads-build.log、training-reads-image.log/.exit，最终training-reads-final-web.log/.exit、training-reads-final-build.log、training-reads-final-image.log/.exit与跨页红测training-reads-shared-red.log/.exit。日志不纳入仓库，不含业务数据。

## 独立真实API/PG与浏览器

独立测试Agent编写training-read-evidence.mjs并接入原policy链，保留原正常训练动作和POST超时断言。初版Web镜像interview-web:training-reads构建真实exit0；链运行期间新增跨页红测修复，最终镜像interview-web:training-reads-final构建真实exit0，初链结果只能作为中间实现证据，最终链需用最终镜像重验；API/Lab复用未变更已验镜像。最终完整隔离链training-reads-final-chain2真实exit0（最终镜像），API93/93、原有Lab/Interview/训练动作与POST原生60秒断言保留通过；新增读取浏览器门与严格恢复均通过。

本轮实际通过窗口：岗位503不误报无岗位且不自动重试；实际初始推荐GET整回执延迟原生60秒后仅GET恢复；实际完成201与PG唯一Attempt先落库，后续GET延迟60秒，解除等待后仅GET恢复COMPLETED且无重复POST；旧READY GET在SPA卸载/返回后不能覆盖实际COMPLETED。浏览器只延迟整回执，响应正文挂起由原生Response/组件测试覆盖，不混淆两类证据。

## 限制、费用与合并门

私有fixture正式证据为合成seed，不是简历→成功面试/SSE→正式报告的完整黄金链，不是模型效果、学习提升或部署验收。无外部模型调用，费用0；历史已知0.069285CNY另有未知费用，账单/额度边界不变。最终链已实际核对PG完整schema/行多集/sequence一致及实际Milvus题目/Qdrant向量payload恢复，真实exit0；最新候选push/PR精确六项CI完成前，不合并或声明远端阶段交付。

## 首轮失败与最终复核限制

初版链training-reads-chain真实exit1，失败在新增helper将全部POST（包含潜在Web Vitals）计为训练写，2≠0；当时未记录URL，两次具体归属仍未知。guard正确未启动后链，未把先前PASS行当完整通过。该链未执行后续完整PG/向量恢复验收，仅退出trap删除私有fixture，不能冒充恢复通过。

检查web-vitals.ts实际sendBeacon/fallback POST后，helper保留所有POST路径/count，失败打印全map；只排除确切/api/metrics/vitals，其他任何POST仍必须零/一次，未仅白名单训练路径或删除断言。最终链实际记录metrics/vitals两次、当前合成推荐complete一次，独立真实PG Attempt核验及GET恢复COMPLETED通过，无重复complete/start/refresh。最终日志不能反向证明前失败窗口两次必为metrics。

独立Agent编写真实浏览器helper、审过产品读取/取消/key/profile和第13追加红测；最终运行结果复核因其额度中断而失败，未记独立Agent最终运行复核通过。父代理执行并读回最终链exit0及原始PG/browser恢复证据。后续远端CI独立执行仍须精确候选门。

## 精确远端候选

PR59候选ac03104201c361a0c23814405e901e09fa0ff178已提交推送，SSH读回origin/agent-lab同SHA、main仍e108a68，PR59已附当前聊天。最新PR run39831947507绑定该候选；Actions按head/event=push查询total_count0，没有push CI，不补造记录或推断原因。已一次成功workflow_dispatch，响应及Actions读回run39832266991同head；以该分支run与PR run最新六项作业作为相同源码两组门，全部完成成功才冻结head合并。当前仍在运行，不预填通过。

本机gh初次读API失败（TCP reset）是观测网络，未当CI失败。GitHub连接器通用github_fetch支持Actions集合与明确query，可读真实head/event/attempt，避免只返回PR的专用wrapper遗漏分支run。触发dispatch返回明确run URL且远端读回queued，未盲目重放。

后续实测：18:49:10Z平台才生成同head push run39834697409，排队更高优先级请求在18:49:55Z取消旧dispatch39832266991。实际check annotation明确“Canceling since a higher priority waiting request for product-Product verification-refs/heads/agent-lab exists”；不是30分钟超时或源码断言失败。dispatch Docker120011194465取消在browser dependencies，后两项storage/API-browser-recovery skipped；lint120011194938成功、summary120020224704失败保留。日志另有apt20.5MB耗14min9s，但不将它推断为取消原因。未重跑已被替代的dispatch。最新门恢复为push39834697409与已成功PR39831947507（Docker120010079939/lint120010080064/summary120018430376），同head ac03104，等待push最新全成功。
