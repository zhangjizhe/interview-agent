# 排查报告 · 2026-06-20 凌晨

> "页面请求全都 404" 实际是 3 个不同根因叠加,看起来像 404,实质覆盖前端 → 容器 → 业务层全链路

## 根因 1 · Web 容器 nginx.conf 没跟 workspace 同步(显性 404)

**症状**

```
GET http://localhost:5173/api/admin/mcp-servers → 404
{"path":"/admin/mcp-servers","message":"Cannot GET /admin/mcp-servers"}
```

注意:返回的错误 path 是 `/admin/mcp-servers`,**不是** `/api/admin/mcp-servers`。

**根因**

- web 容器是 **13 小时前** 构建的,内含**旧版** `apps/web/nginx.conf`:
  ```nginx
  location /api/ {
      set $backend "http://api:3001";
      rewrite ^/api/(.*)$ /$1 break;   # ← 老版本,把 /api/ 前缀剥掉
      proxy_pass $backend;
  }
  ```
- workspace 里的 nginx.conf 已经在 `20b413ae4` 提交时移除了 rewrite,但**容器没 rebuild**。
- 旧版 nginx 把 `/api/admin/mcp-servers` 改成 `/admin/mcp-servers` 转发到 `api:3001`
- API 端有 `app.setGlobalPrefix('api')`,实际路径需要 `/api/...` → 不匹配 → 404

**修复**

```bash
docker compose up -d --force-recreate --build web
```

让 web 镜像内嵌 workspace 的新 nginx.conf。

---

## 根因 2 · Milvus `question_bank_v2` 缺 `sparse_bm25` 索引(隐性 500)

**症状**

```
GET /api/interview/question-bank/list → 500
there is no vector index on field: [sparse_bm25], please create index firstly
```

**根因**

- collection 是早期版本时创建的,只有 `vector`(dense)索引,没有 `sparse_bm25` 索引
- 后端 v2 schema 升级(加了 BM25 字段),但老 collection 没 drop 重建
- `ensureCollection` 检测到 collection 存在时只 `loadCollection`,不会补建索引
- `Milvus describe` 验证: `"indexes":[{"fieldName":"vector","indexName":"vector","metricType":"COSINE"}]`

**修复**

```bash
# Drop 旧 collection,让 ensureCollection 走 createV2Collection 重新创建(含 BM25 function + 双索引)
curl -X POST http://localhost:19530/v2/vectordb/collections/drop \
  -H "Content-Type: application/json" \
  -d '{"collectionName":"question_bank_v2"}'
```

下次 `ensureCollection` 触发时:
```
[QuestionBankService] ✅ Question bank v2 collection created (dense + BM25 hybrid)
```

---

## 根因 3 · P0 修复的 `threadId` 透传逻辑不工作 → 触发 FK 违反(最隐蔽的 500)

**症状**

multi-agent 模式下,任何消息都会 500:

```json
{"type":"error","error":"Foreign key constraint violated: `session_costs_interviewId_fkey (index)`"}
```

API 日志:
```
[FLUSH] start interviewId=unknown
[FLUSH] FAIL interviewId=unknown err=Foreign key constraint violated
```

**根因分析**

之前的 P0 修复链路是断的:

1. **LangChain v1.x 内部机制**:
   ```ts
   _separateRunnableConfigFromCallOptions(options) {
       runnableConfig = {callbacks, tags, metadata, runName, configurable, recursionLimit, maxConcurrency, runId, timeout, signal}
       callOptions = { ...options } 但 delete 掉上面 11 个字段
   }
   _generate(messages, options, runManager)  // ← options 是 callOptions,没有 configurable
   ```

   所以 **`_generate` 拿到的 options 已经不含 `configurable.thread_id`**。

2. **LangGraph 节点调用模式**:
   ```ts
   // supervisor/planner/reviewer node 里:
   model.withStructuredOutput(zodSchema).invoke([...])  // ← 没传 config
   ```
   即使 LangGraph 内部把 config 传到 node,node 内部也没透传给 model。

3. **结果**:
   - `_generate` 里 `options?.config?.configurable?.thread_id` 永远 undefined
   - fallback 到 `this.interviewId` (硬编码 `'unknown'`)
   - session_costs 写入时 `interviewId='unknown'` 不在 `interviews` 表里 → FK 违反 → 500

**修复方案:AsyncLocalStorage(ALS)**

不用改任何 LangGraph node 函数(太侵入),而是在 run/stream 入口设 threadId,`_generate` 读 ALS:

```ts
// llm-gateway-chat-model.ts
export const threadIdStorage = new AsyncLocalStorage<{threadId?: string; userId?: string}>();

async _generate(messages, options, _runManager) {
    const ctx = threadIdStorage.getStore();
    const optionThreadId = options?.config?.configurable?.thread_id
        ?? options?.configurable?.thread_id
        ?? options?.runId;
    const threadId = ctx?.threadId ?? optionThreadId;
    // 用 threadId 当 interviewId
}
```

```ts
// multi-agent.service.ts
async run(userMessage, threadId, history) {
    const result = await threadIdStorage.run({threadId, userId}, () =>
        this.graph.invoke(input, config)
    );
}
```

`stream` 是 async generator,ALS 上下文不会自动延伸到 consumer 端,改用 **producer/queue 模式**:

```ts
async *stream(...) {
    const queue: any[] = [];
    const producer = (async () => {
        await threadIdStorage.run({threadId, userId}, async () => {
            for await (const [msg, meta] of self.graph!.stream(...)) {
                queue.push({kind: 'data', msg, meta});  // ← 在 ALS 上下文里 push
            }
        });
    })();
    // generator 端从 queue pull 给 consumer
    while (queue.length) yield ...;
}
```

**验证**

```
[PRISMA] INSERT INTO "public"."session_costs" ... params=["cmql7ihl10007gc5d1g9y1pue", "cmql7ihiy0003gc5dc5yxorjq", ...]
                                          ↑ session_costs.id        ↑ interviewId(真实值,不再是 'unknown')
```

`session_costs` 表有真实 interviewId 的行,FK 违反不再发生。

---

## 全量验证(最终状态)

| 端点 | 状态 |
|---|---|
| `GET /` (SPA root) | 200 |
| `GET /interview/:id` (SPA fallback) | 200 |
| `GET /question-bank` | 200 |
| `GET /tools` | 200 |
| `GET /admin/mcp` | 200 |
| `GET /api/health` | 200 |
| `GET /api/tools` | 200 |
| `GET /api/tools/preferences?userId=` | 200 |
| `GET /api/interview/list?userId=` | 200 |
| `GET /api/interview/stats?userId=` | 200 |
| `GET /api/interview/empty-rooms?userId=&idleMinutes=` | 200 |
| `GET /api/interview/question-bank/list?position=&limit=` | 200 ✅ (修了 Milvus 索引) |
| `GET /api/interview/question-bank/search?query=` | 200 |
| `GET /api/knowledge-base/list` | 200 |
| `GET /api/knowledge-base/recall?query=` | 200 |
| `GET /api/admin/mcp-servers` | 200 ✅ (修了 nginx) |
| `POST /api/metrics/vitals` | 201 |
| `POST /api/interview/upload-resume` | 201 |
| `POST /api/interview/start` | 201 |
| `POST /api/interview/:id/message` | 200(SSE)✅ (修了 threadId) |

E2E 流(完整):
1. 上传简历 → 201
2. 启动面试 → 拿到真实 interviewId
3. 发消息 → 多 Agent 模式正常返回 token 流,无 FK 错误
4. session_costs 表里有真实 interviewId 的成本记录
5. 第二次发消息 → 召回 3 条短期消息(说明 checkpointer 工作)

## 容器状态

```
interview-api            Up 5 minutes (healthy)  ← rebuild
interview-web            Up 12 minutes           ← rebuild (新 nginx.conf)
interview-postgres       Up 2 days (healthy)
interview-redis          Up 31 hours (healthy)
interview-qdrant         Up 6 hours (healthy)
interview-milvus         Up 15 hours (healthy)
interview-milvus-etcd    Up 16 hours (healthy)
```

## 提交

`7b1f9e208 fix(api): 多 Agent 模式 3 个真问题 + 容器构建修复`

## 经验沉淀(写到 memory)

1. **改 web 容器任何东西后必须 rebuild**——直接 docker exec cp 是临时方案,容器重启就丢
2. **Milvus collection schema 升级必须 drop 重建**——`ensureCollection` 的 lazy load 不会补建索引
3. **LangChain v1.x 的 `_generate` 拿不到 `configurable.thread_id`**——必须用 ALS 透传
4. **LangGraph node 调 `model.withStructuredOutput().invoke(messages)` 不传 config 是普遍写法**——别指望改 node 函数,改 ALS
