# 结束请求正文超时与资源清理

2026-10-22；基线 `435b931a07dbed82e31d820f7992aa8e60365a4e`，整体 NOT_ACCEPTED。

## 当前源码与产品合同

handleEnd 原60秒定时器在fetch返回headers后立即清除，safeJson的res.text()仍可能无期限等待；页面失效也没有中止该客户端等待。safeJson的text读取发生在JSON解析try/catch外，原生AbortError会传给调用方。

最小修复保留定时器直到finally，覆盖响应正文读取；Map登记controller与timer，路由/卸载先使pageLifetime失效，再清计时器并abort客户端请求，清Map并释放ending。每个请求finally只清自身timer/Map项，不清新请求资源，原生命周期与回执校验保持。超时提示明确结果未知、先刷新核验，未增加自动重试。

不改后端、数据库/API/权限/架构，不承诺停止报告/删除/计费或退款；客户端终止等待不是回滚。非原生且忽略abort的自定义transport不保证及时结束。本轮原生fetch/Response合同，仍不声明多个同时Page实例共享store安全。

## 实际测试

- 实际Page + 原生Response/ReadableStream，在fetch headers已返回而正文挂起时，旧实现两项失败/原23项通过：60秒不abort与卸载不abort。
- 修复后Page25+SSE12共37通过；校验59,999毫秒未超时、60,000毫秒abort并释放ending/无导航/提示未知，卸载abort且无旧提示、计时器总数归零；既有生命周期/回执正向控制保留。
- 定向lint与Web构建（含tsc）通过；独立初审无新增阻断。独立最终源码审核无新增阻断。
- AST原128原生/Link节点文本及顺序不变，仅行号/hash更新；清单987最终NOT_ACCEPTED，ID/审查证据字段保留。超时alert文本在JSX外明确改为“结果尚未确认，请刷新核验”。

## 浏览器及PG（本轮实际通过）

额外owned临时零消息Interview，实际draft拒绝产生页面乐观消息，真实end删除资源；持有完整实际响应不交Chrome，PG核资源已删。浏览器实等原生60秒超时，页面保持当前路由、恢复结束入口且显示结果未知，再释放旧回执不能导航，PG再次核已删。此场景只证明完整回执/headers前等待超时，不是body-only浏览器流；headers后正文挂起由上述原生ReadableStream页面测试证明，不混淆。

实际单次观察elapsed_ms=60016（非性能Benchmark），至少59秒断言通过；75秒测试上限，finally释放路由/定时器；父fixture按owner及临时ID幂等清理，原模型/账本计数、确认/历史/结束正常路径与严格恢复保留。有隔离PG写入/删除，不是只读；模型报告质量不在本轮范围。

## 待完成

新镜像API93/Lab及候选实际60秒超时和PG两次删除读回、严格PG恢复已通过；实际Milvus题目/Qdrant向量payload恢复及完整exit0通过；精确提交CI/PR合并待完成。外部模型费用0，历史未知账单不记零。未部署，整体未交付。
