# 答案缓存生命周期

更新：2026-10-08。产品缓存只使用 Redis `answer-cache/v2` 精确匹配，TTL 一小时；Lab 评测始终绕过。缓存原文只保存在受控 Redis 值中，key 不含身份和问题明文。

Provider 模型名、端点或可变别名背后的版本调整时，部署方必须更新 `ANSWER_CACHE_REVISION`，所有 API 副本使用同值并滚动重启。新 revision 不读取旧桶，旧桶自然到期；不重置模型使用账本。此为显式治理，不能自动侦测厂商未公告的别名变化，也不证明新的费率已核验。

旧 Qdrant `semantic_cache` 已停读、停写。本机只读核验共 51 点，其中 2026-09-08 前 30 点满足至少 30 天保留规则；没有读取正文或执行删除。治理工具 `scripts/cache-legacy-retention.mjs` 默认仅预览，只针对此停用集合；缺 createdAt 的点不自动清理。

实际删除必须先创建并下载私有集合 snapshot，验证在隔离环境恢复；固定 `--before` 重新预览，提供同一 `--confirm-plan` 哈希与已存在 `--snapshot` 名称。哈希包含准确 ID 集，计划变动拒绝执行，分批删除这些 ID 后核对结果。不得删除知识库/记忆集合；新租户的派生旧集合需单独核对，工具不接受任意集合名。

```bash
node scripts/cache-legacy-retention.mjs --before=2026-09-08
# 仅在 snapshot 已恢复验证、预览计划获准后执行：
node scripts/cache-legacy-retention.mjs --before=2026-09-08 --confirm-plan=<预览哈希> --snapshot=<私有快照名>
```

旧 `scripts/bench-cache-50.ts` 已改为当前产品 v2 合同，要求先 build API 并显式设置 `CACHE_BENCH_REDIS_URL`，不加载 .env、访问 Qdrant 或调用模型/embedding。只删除本次随机 fixture 的 key。50 次真实 Redis 检查通过：10 次完整请求重复命中、40 次首次/改写/别名 revision/组织变化未命中；本机 lookup p95 为 0.427 ms。该值是合成场景工程结果，不能称生产命中率、模型延迟或费用节省。

真实费用与端到端延迟对比仍须正规额度及有界预算、同一模型费率凭据和实际样本；未执行即不作效果声明。
