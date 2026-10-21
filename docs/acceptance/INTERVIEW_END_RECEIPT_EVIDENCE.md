# 结束面试回执校验

2026-10-22，基线 `cab49e7d6a762bc601727175bd9a625f3c1e5057`。整体 NOT_ACCEPTED。

## 源码及产品合同

InterviewPage.handleEnd 原先未核 HTTP ok，safeJson 后除 truthy deleted 外均设 COMPLETED 并跳报告。实际 Nest endInterview 先 requireOwnedInterview：空面试删除后回 `{deleted:true,reason:'no_messages'}`；非空返回包含 Prisma savedReport 的 `{report,...}`，Report 有真实 id/interviewId。后者可能调用模型及持久化评价，不在本轮真实模型测试范围。

最小改动只在前端：非成功HTTP拒绝；删除分支必须布尔true且原因为no_messages，矛盾删除回执拒绝；报告须有去空白非空id且interviewId匹配当前提交目标，才设完成并导航。错误使用现有提示，保留输入与显式重试入口，无自动重放。HTTP失败/损坏回执不保证后端未执行、未完成或未计费，应刷新真实状态核验。

无架构、数据库、API、鉴权变更，不增模型调用，不声明跨路由迟到end安全：该P0仍待单独复现/修复；既有超时仅fetch headers前计时边界保留，不声称延迟body也受60秒限制。

## 本轮实际验证

- 实际Page最初3项红测/旧11项绿：HTTP503、空200回执、其他Interview报告均被旧实现当完成；原断言保留。
- 修复后增加空白report id、矛盾删除回执拒绝及两合法形状正测，Page18+SSE12共30通过；定向lint及Web构建通过（含tsc）。
- 独立终审无当前执行阻断；trim校验、临时route finally清理和两个错误提示内容断言已补。
- AST核对128原生/Link节点文本/序列不变，仅更新行号/hash；库存987项旧ID/审查字段保留，全部最终NOT_ACCEPTED。

## 浏览器/持久化（本轮已实际通过）

复用私有owned alternate Interview，先实际draft策略拒绝形成乐观消息（实际PG无消息，无模型调用）。对结束请求分别注入503与200空JSON，不执行后端；页面应保留当前路由/结束入口，独立PG核IN_PROGRESS且消息0。最后真实POST结束空面试，核精确删除回执、导航首页和PG资源缺失。该场景验证空面试分支，不证明真实成功生成报告或评价质量。原确认/SSE/history浏览器保留，父fixture核Run/ledger/provider stats、原面试消息与合成简历清理。

## 待完成

新镜像实际API93/Lab及候选结束回执浏览器、PG状态/删除读回、严格PG恢复已通过；实际Milvus题目/Qdrant向量payload恢复及完整exit0均通过；精确提交CI和PR合并待完成。外部模型费用0，历史未知账单不记零。未部署，完整交付未通过。
