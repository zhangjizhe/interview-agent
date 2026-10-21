# 结束请求页面生命周期

2026-10-22；基线 `9e9f05d4510454a1e456272985cb8e808e89980c`，整体 NOT_ACCEPTED。

## 产品合同与最小实现

源码核对：handleEnd 的旧闭包在 await 后可设共享 COMPLETED、弹窗、导航，并在 finally 清共享 ending；原回执校验不隔离页面生命周期。后端真实结束可能已删除空面试、生成报告或计费，前端忽略旧响应不能撤销这些动作。

复用原历史 GET 的对象生命周期并改名 pageLifetime，在路由变化和卸载失效并释放旧页面 ending；handleEnd 捕获对象，在响应 body 解析后、catch 及 finally 校验归属。旧请求不再改当前消息页状态、提示或导航，也不能清除新会话 ending。A→B→A 使用新对象；保留当前页面正常回执处理。没有后端取消、退款或新增重试，不声称多实例共享 store 的并发安全。

无架构、数据库、API、权限或模型调用变更。仍沿用现有60秒 fetch超时，响应headers后body超时边界未在此批改造。只读旧回执可继续占用网络。

## 本轮实际测试

- 实际Page旧代码四项失败/旧18项通过：switch、A→B→A、unmount、迟到503；首先捕捉边界ending未释放，后续断言保留旧回执不得导航/提示/COMPLETED或清新ending。
- 修复后补延迟body场景，Page23+SSE12共35通过；包括先设新会话ending=true，旧finally完成后仍为true。当前有效报告/删除两成功形状正测保留。
- lint、Web构建和最终typecheck通过；AST原128原生/Link节点文本与序列不变，仅行号/hash调整；清单987最终NOT_ACCEPTED，旧ID/审查字段保留。
- 独立最终源码审核无新增阻断。

## 真实API/浏览器（本轮实际通过）

保留此前当前页面正常空面试结束→首页证据；增加私有owner的临时零消息Interview（不是业务数据）。实际草稿策略拒绝形成页面乐观消息，不增加PG消息或调用模型；真实end先删除资源，扣住完整实际删除回执。PG读回资源已不存在，SPA切回另一条真实owned Interview，填草稿后释放旧回执，断言当前路由/输入/可用状态保留、无旧弹窗，PG再次确认旧资源已删除。

父fixture按owner和两个临时ID做幂等清理，原Run/ledger/provider stats及原Interview消息检查保留。场景有真实隔离PG写入/删除，不能称只读；不证明模型生成报告的成功质量，不证明后端停止计费。

## 待完成

新镜像首完整链exit0：API93、Lab与候选真实结束回执/跨页面场景、严格PG schema/行多集/sequence及实际Milvus题目/Qdrant向量payload恢复通过；精确提交CI和PR合并待完成。外部模型费用0，未知历史账单不记零；未部署，整体未交付。
