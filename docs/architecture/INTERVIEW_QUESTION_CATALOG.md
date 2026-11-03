# Interview 题库主数据与检索索引

2026-11-02。当前增量为显式、按组织启用的迁移，不代表部署中的既有题库已迁移或语义质量已验收。

## 业务边界

Interview 的 QuestionBankService 拥有题目当前内容、删除状态和历史版本，Agent Lab 继续拥有 EvaluationDataset/Case。题库不是某一个 Agent 的私有资产，也不是默认可用作验收的保留测试集。共用 NestJS/PostgreSQL 不改变领域归属。

- 未启用：保留 Milvus `question_bank_v2[_tenantHash]` 的原有读写模式，API 状态明确为 LEGACY。
- 启用后：PostgreSQL `question_catalog_entries` 是当前业务事实；`question_catalog_versions` 保存每次内容变更的快照；新 Milvus `question_catalog_v1[_tenantHash]` 仅用于召回。旧 collection 不删除、不覆盖。
- `catalogVersionId` 等于 `entryId:version`，也实际用作版本表主键与新索引的 questionId；`catalogContentHash` 是规范化业务内容 SHA256。旧 Milvus 题目没有伪造的版本号。
- 初始选题直接读 PostgreSQL，不依赖 embedding 或索引。版本和 hash 进入任务 context 及 InterviewQuestion 的 selectionMetadata。当前不表示所有历史面试已经回填版本引用。

## 启用流程与一致性

先部署全部新 API 实例，停止旧版本实例与离线脚本/直接 Milvus 写入，在维护窗口中由本组织 ADMIN 执行：

1. `GET /api/interview/question-bank/catalog/status` 查看模式。
2. `POST .../catalog/adopt-legacy`，body `{ "maintenanceConfirmed": true }`。
3. 成功回执具有 `contractVersion: "question-catalog/v1"`、`mode: "CATALOG"`、`providerCalls: 0`。相同组织再次提交为 `reused: true`；通过 GET 独立回读实际状态。
4. `POST .../catalog/rebuild-index`，body `{}` 每次处理最多 20 个 PENDING 题目；重复显式请求继续处理剩余批次。也可传 `{ "questionIds": ["business-id"] }` 显式重建至多 20 个指定题目。

迁移不会从默认组织复制到别的组织，不改用户/组织归属。每次读取以 Strong query 分页（100/页，最多 1000 题），检查 RPC 回执、页长度、主键唯一与前后 count；两次完整快照规范化 hash 必须一致。重复业务 questionId、冲突或无效题目拒绝整次迁移，保留旧源。超过上限时明确拒绝，不能将截断数据当成完整迁移。大于 1000 的目录需要单独设计分批冻结迁移。

所有新服务的普通写入、迁移与重建使用 PostgreSQL 同组织状态行的 update 行锁，事务中持有，跨新实例串行。迁移完成状态与整批主数据/版本在同一事务提交，失败回滚。该机制不能协调仍直接写 Milvus 的旧版本/外部脚本；双快照检查也不是对不受控并发写的绝对保证，因此维护窗口是必要前提，不能称无中断迁移。

事务最大 180 秒、等锁 5 秒，索引或旧 Milvus 操作可能持有较长锁，其他同组织写可能等待或失败。未知 HTTP 结果先读取状态，不自动重发付费请求。

## 写入与失效语义

新模式先事务保存当前记录和新版本，再尝试建索引。成功返回 `canonicalStatus: SAVED` 与 `indexStatus: READY`；索引失败返回 `SAVED/PENDING`，不删除已保存的题目，也不声称语义检索可用。相同题目 ID/相同内容的再次写入不创建新版本，也不会自动再次支付 embedding；PENDING 必须通过显式重建恢复。

内容变更生成新版本；旧版本不被 API 更新。数据库 trigger 拒绝 UPDATE 版本，但本次未宣称数据库具备不可删除历史的完整保留策略。软删除只改当前条目的 deletedAt，历史快照保留；失效向量不会恢复被删除的业务题目。

索引回传仅视作 key/排序信号。业务读取会重新验证当前组织、未删除状态、当前版本 key、READY 状态与岗位/难度/类别过滤，再以 PG 当前内容生成结果；外部 rerank 只收到过滤后的 PG 内容，数量不超过请求 limit。任何 PENDING 当前条目存在时，语义搜索返回明确 503，管理员仍可通过 PG 列表查看。

召回最多 100 条，再去重/过滤；旧向量可占据召回窗口，不能据此保证完整 Recall。索引可由 PG 重建，不代表本轮实现了自动全量压缩/清理旧向量。外部索引被整体删除时需要显式对业务 ID 分批重建，READY 标记不代表持续主动探测外部索引健康。

## 权限、费用与验证

状态、迁移、重建均 ADMIN，组织来自认证 TenantContext；新表由现有 DMMF organizationId middleware 自动限制，并以复合外键限制版本归属。题目/答案不写入操作回执。迁移无 Provider 调用；重建每批最多 20 次 embedding，复用 Gateway 配额和单调用输入/费用边界，不自动重试。它不是整批预付费用预留，不保证聚合硬费用上限，也不把未知费用补零。

验证资产：

- `question-bank.catalog.spec.ts`：离线故障、相同内容不重付、当前版本 hydration、删除/旧向量不进入 rerank、分页不完整拒绝。
- `question-bank.catalog.database.integration.spec.ts`：独立隔离 PG 客户端下版本、失败回滚、组织隔离、真实行锁等待与跨实例写入串行。无测试数据库时明确跳过。
- `scripts/ci/verify-question-catalog.mjs`：只允许隔离 fixture DB/Milvus；独立合成 ADMIN，实际 HTTP→PG→Milvus→当前内容/删除保护、旧源不变。不是生产数据迁移或真实模型效果。
- 已有 vector RPC/补偿/恢复测试改为直接测试抽出的 QuestionVectorIndexService，未删除原有断言。

回滚：旧 Milvus 源持续保留，但迁移后 PG 新增/修改未自动反向同步旧源。不能简单切回旧版就声称数据完整；应冻结写入、导出 PG 新版本并核对后制定回迁，不直接删新表/迁移。
