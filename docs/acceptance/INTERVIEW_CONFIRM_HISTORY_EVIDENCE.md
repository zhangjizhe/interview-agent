# 简历确认与历史读取并发

2026-10-21，基线 `320472c6b293deb59fbde3118bddc20696e5f3cf`。整体 NOT_ACCEPTED。

## 当前源码与产品合同

InterviewPage 历史加载/刷新会设置 resumeConfirmed；confirmResumeStart 经 HTTP ok + success:true 回执及现有 mounted/attempt/route 归属检查后置 true。后端 confirm-resume 经 requireOwnedInterview 后真实 PostgreSQL 更新。历史 GET resume 来自 ResumeRAGService 按当前 user 查询 Milvus。不存在本轮数据库/API合同改动。

确认开始时递增现有 historyRequest，使较早快照永远失效；确认在途下拉刷新直接结束，不发 GET。确认失败可再次刷新查询真实状态。保留原回执、路由和卸载防护；不宣称所有简历上传/报告/结束/其他并发修改均已保护。不改变鉴权/架构或模型调用，不取消已有 metadata GET。

## 测试事实

- 初次新测试漏设 store 默认 true→false，确认按钮不存在。该失败为夹具错误，不是产品红测；未据此记验收。
- 修正未确认夹具后，在修复前源码上两项预期失败：旧 GET 把成功确认 true 改回 false；确认在途刷新多发一次 GET。原有9项通过。
- 修复后实际 Page11 + SSE12 共23通过：包括确认失败后再次刷新可读回 true、在途刷新零新增 fetch、已有历史正向/归属/顺序保护。
- Web构建、最终lint/typecheck均通过。AST保持128原生/Link节点文本和顺序，更新行号/hash，清单987最终NOT_ACCEPTED，旧ID及审查字段保留。
- 独立审核主体无产品阻断；指出fixture需实际SDK Strong枚举及成功回执/数组结构判空，已修正；插入数量1及响应promise拒绝观察也已补。最终源码复核无新增阻断；第二完整链exit0：API93/Lab及候选确认浏览器、Strong清理、严格PG schema/行多集/sequence和实际Milvus题目/Qdrant向量payload恢复通过。

## 浏览器和持久化（最终结果待核）

首完整链API93/Lab及原候选场景通过，但新增确认场景在真实确认回执后查找通用placeholder超时：源码有resume时实际placeholder是“简历已上传，开始面试吧...”。这是定位错误，未执行最终释放旧GET断言，不计通过。已修正定位并连同Strong清理改动重新完整运行；保留首轮失败，不删断言。

固定私有DB和Milvus地址；seed单条明确合成简历、1024维人工向量，不调用模型、不证明embedding或简历解析质量。实际API按user查询后显示确认面板；通过真实下拉刷新事件扣住实际 GET false，再点击真实确认按钮。核实际 success:true HTTP回执与PG true，释放旧GET后确认面板不能重现且输入可用。

父fixture继续核原Interview消息0、Run/ledger/provider stats不增加，恢复原resumeConfirmed/Agent指针并删除临时Interview；额外按合成marker删除Milvus简历并Strong读回为空，清理错误需保留。临时Interview不另声称PG消息0。所有数据限隔离容器。

## 未完成

本地限定验收完成；精确提交CI和PR合并待完成。外部模型费用0，历史未知账单不记零。未部署、真实模型质量与完整交付未通过。
