# Interview History GET 生命周期验收

2026-10-21；基线 main/agent-lab `42d1f997dfa6c1b81c9eead8cad5eff6799e39cc`。整体 **NOT_ACCEPTED**。

## 产品合同与源码事实

InterviewPage 的初次加载和下拉刷新均读取认证后的 `/api/interview/:id`，经 safeJson 后写入共享 store。原实现没有请求所属页面生命周期校验；旧响应可以覆盖新面试消息、简历、确认状态，旧 COMPLETED 加载还可跳到旧报告。

最小修复在实际页面建立路由生命周期对象，在 ID 变化/卸载时失效；两个 GET 路径解析 body 后、所有状态写入和导航前核对对象。A→B→A 使用不同对象，不能只比较 ID。保留正常历史加载、刷新和已结束报告导航。

没有架构、数据库、API 合同、鉴权或模型调用变化；不取消传输、不保证服务端取消。此处是页面异步归属保护，不替代服务端所有权校验。同一生命周期多个刷新与 SSE 的时序一致性另列待办，本轮不声称覆盖。

## 本轮实际验证

- 实际 InterviewPage + mocked transport/stream/pull hook：原实现五项均失败，覆盖加载、刷新、延迟 body、A→B→A、卸载；修复后五项通过。另加当前加载/刷新/COMPLETED 导航正向控制通过。
- 与现有 SSE 生命周期回归合计 18 项通过；定向 eslint、Web typecheck/build 通过。
- 独立测试 Agent 源码复核无当前生命周期阻断；建议已落实 fetch stub 恢复。复核明确不覆盖同会话多个刷新先后顺序。
- AST 比对实际页面全部 128 个原生/Link 节点文本和顺序相同，仅更新清单行号/hash；总清单仍 987，全部最终 NOT_ACCEPTED，原审查字段保留。
- 新候选镜像首轮完整隔离链 exit0：实际 API93/93、既有 Lab 浏览器及候选 held-SSE/history-GET 浏览器、PostgreSQL schema/行多集/sequence 与实际 Milvus 题目/Qdrant 向量 payload 恢复全部通过。独立最终源码审核无新增阻断。

浏览器新增场景不制造 GET 内容：扣住实际认证 GET（实际持久消息为空），SPA 切到另一条真实 owned Interview，发送被草稿策略拒绝的合成消息形成页面乐观消息，再释放旧 GET，断言当前消息及路由保留。既有 fixture 核对 Run/ledger/provider stats 及原面试 PG 消息仍为零，恢复指针并删除临时面试；不声称对临时面试另做了 PG 零消息断言。属于合成隔离工程合同，不是真实模型质量；外部模型费用 0。

## 待完成与发布边界

待精确提交 CI、PR 和远端合并核验；GitHub 只读 PR 查询一次自动审批超时，允许的一次重试已获审批但 TCP reset，未创建 PR、未声称远端通过。未部署；真实质量历史失败与未知费用、历史题目归属、完整 B1 和整体交付未通过。
