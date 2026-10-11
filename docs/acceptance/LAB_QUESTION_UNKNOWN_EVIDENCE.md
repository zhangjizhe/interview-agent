# 题目已写入但浏览器回执未知

## 限定产品合同

实际题目写入成功但浏览器无法确认时，保留输入、显示先核存储再重试的提示；不自动重发模型请求。管理员可用真实列表核对是否已有题，刷新后页面展示实际已存题，避免盲目重建。当前草稿仅内存，刷新会清草稿，不宣称刷新保留输入。

只增加独立隔离浏览器helper，不改产品/API/数据库/权限。测试代理先拿到真实POST201与questionId，再改投503给浏览器：明确仅模拟成功回执丢失，不能证明自然API未知插入或真实网络故障。底层SDK补偿真实性另见LAB_QUESTION_WRITE_INTEGRITY_EVIDENCE.md，不能互相替代。

计划核对：失败界面六字段保留及可编辑、未知先核验提示、会话保留；只一个POST和一个合成embedding/LLM_CALL账本增量；真实list逐字段读回相同ID，刷新浏览器真实list+展示一致；显式删除合成题且Strong空读回。使用已有snapshot固定私有数据库与Provider聚合计数，不保存内容/秘密日志。额外一次离线Provider embedding有合成账本，外部费用0；历史未知账单不记零。

## 当前状态

独立helper与接入语法/eslint/diff通过，独立最终审查无阻断。首次完整隔离链exit0：API82/82、全部浏览器、严格PostgreSQL schema/行多集/sequence等值、Milvus题目和Qdrant vector/payload恢复通过。应用沿用已验API sha256:0ee7eec3d49142eb5332bb89a513d6a9331af68371edc69b39e0709f54cf3a6c、Lab sha256:38bcfffea5a8743e165d145dbcf5f3dc2d3f9677a8c178c002eefda7e9696654，无应用代码变更，未重复type/build。

网络恢复后确认上轮无开放PR，a13226a的push三项CI成功；已创建PR21并附到聊天，新PR检查运行中，尚未合并。本轮证据暂存本地，不改变PR21精确head。仅为既有六字段、保存和创建错误模板补充限定证据，累计34模板PARTIAL，最终980仍NOT_ACCEPTED。真实质量/全UI/生产验收/旧题复用前置保持；不能把代理回执故障升级为自然API或全部未知持久化恢复通过。

PR21 exact a13226a six latest checks succeeded; merged and remote main verified 5f0103dd20ed6718f44e2e447f1c9e6a29d59dba. This evidence batch requires its own new commit CI before merge.
