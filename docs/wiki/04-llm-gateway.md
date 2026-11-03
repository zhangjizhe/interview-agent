# 04 · LLM 网关

> 代码：`apps/api/src/modules/llm/`（15 个文件，2,629 行）
> 核心：`llm.gateway.service.ts`（451 行）· `providers/`（base + qwen + deepseek + types）· `cost/`（计价 + 会话成本）· `usage/`（额度）· `cache/`（prompt + answer）

这是整个项目最值得读的模块：把「多模型、可降级、可计价、可审计」四件事塞进了一个 451 行的服务里。

## 1. Provider 抽象

```ts
export abstract class BaseLLMProvider {
  abstract readonly name: string;
  abstract readonly defaultModel: string;
  abstract chat(params: ChatParams): Promise<ChatResponse>;
  abstract streamChat(params: ChatParams): AsyncGenerator<StreamChunk, void, void>;
  countTokens(text: string): number;   // 粗略估算，非真 tokenizer
}
```

两个实现：

| Provider | 客户端 | 默认模型 | 特有实现 |
| --- | --- | --- | --- |
| `qwen` | `openai` SDK + `baseURL` | `qwen-plus` | `embedText`（1024 维 `text-embedding-v3`）、`rerank`（`gte-rerank-v2`）、prompt cache 透传（`prompt_cache_key` + `cache_control`） |
| `deepseek` | `openai` SDK + `baseURL` | 见 `DEEPSEEK_MODEL` | 纯 chat/stream |

两个实现都是 **OpenAI 兼容协议**。配置来自类型化 `AppConfig`（`apps/api/src/infra/config/configuration.ts`）：

```ts
qwen:     { apiKey, baseUrl, model, rerankUrl }
deepseek: { apiKey, baseUrl, model }
```

### 两个硬约束

```ts
this.client = new OpenAI({
  fetch: metrics?.modelFetch('qwen'),   // 指标埋点包在 fetch 上
  timeout: 30_000,
  maxRetries: 0,                        // ← 关键：重试必须回网关重新检查额度并记账
});
```

- **`maxRetries: 0`**：SDK 层自动重试会**绕过额度与账本**，所以关掉，重试交给网关。
- **`fetch` 注入 metrics**：模型调用的网络指标（耗时/状态码）由此采集，新增 provider 时必须同样传入，否则指标面板会缺一条曲线。

## 2. 路由与降级

### 2.1 选路

```ts
private selectProvider(params, preferred?) {
  if (preferred && enabled(preferred)) return provider(preferred);   // 1. 显式指定
  const isCoding = /代码|code|implement|算法|…/.test(lastMessage)    // 2. 简易意图
    || params.tools?.some(t => t.function.name.includes('code'));
  if (isCoding) return enabled('deepseek') ? deepseek : qwen;        //    技术题 → deepseek
  return enabled('qwen') ? qwen : deepseek;                          //    通用 → qwen
}
```

设计意图很清楚：**技术题给 DeepSeek，通用对话给 Qwen**。但它是**关键词正则**，不是模型分类——想升级成意图模型，改这里即可（会引入一次额外调用，需评估成本与延迟）。

### 2.2 降级

```ts
private fallbackMap = new Map([
  ['qwen', 'deepseek'],
  ['deepseek', 'qwen'],
]);
```

- 只在**主 Provider 抛错**时启用
- 前提：`providerEnabled.get(fallbackName) === true`
- `params.allowFallback === false` 时不降级（例如前端明确选了某个模型）

### 2.3 永久错 vs 临时错（最值得抄的一段）

```ts
private isPermanentProviderError(err) {
  const status = err?.status ?? err?.statusCode ?? err?.response?.status;
  return status === 401 || status === 402 || status === 403 || status === 404;
}
```

| 状态码 | 语义 | 处理 |
| --- | --- | --- |
| 401 / 403 | key 无效 / 无权限 | **永久禁用该 Provider**，不再尝试 |
| 402 | 余额不足 | 同上（充值后才可能恢复） |
| 404 | 模型不存在 | 同上（配置错） |
| 429 / 5xx | 限流 / 服务端故障 | 临时错 → 走 fallback |

被禁用的是**进程级状态**（`providerEnabled`），换 key 后可调 `setProviderEnabled(name, true)` 复活，`getProviderStatus()` 可查原因。

**为什么必须这么做**：不禁用的话，每一轮都会先打一次必然失败的请求、等超时，再降级——首字延迟直接翻倍。代码注释里明确写了这个教训（`llm.gateway.service.ts:88-89`）。

## 3. 两条调用路径

### 3.1 同步 `chat()`

```
selectProvider
  → 语义缓存查询（fingerprint 匹配 → 直接返回，provider='semantic_cache'，0 token）
  → invoke(primary)
       → promptCache.wrapChat(...)   // 注入 prompt_cache_key
            → quota.reserveLlm(...)  // 额度预留 + 参数裁剪（maxTokens）
            → provider.chat(...)
  → 失败且 allowFallback → invoke(fallback)
  → Langfuse logGeneration（traceId 存在时）
  → 写缓存条件：!isFallback && finishReason==='stop' && content 非空 && preparedMaxTokens===cache.maxTokens
```

最后那个条件很重要：**只有"完整且未被裁剪、且未降级"的回答才允许写缓存**，否则会把截断/降级结果污染缓存。

### 3.2 流式 `streamChat()`

```
selectProvider → 缓存查（命中则 yield 三段：content / usage / finishReason）
  → for await (promptCache.wrapStream(...))
       记录 totalContent / hasEmitted / hasToolCall / finishReason
  → 异常处理：
       永久错 → disableProvider
       hasEmitted === true → 直接抛出（不允许换模型重放）
       hasEmitted === false → 换 fallback，totalContent 清空重来
  → 写缓存条件：actualProvider === primary && stop && !hasToolCall && totalContent && maxTokens 匹配
```

**`hasEmitted` 是流式降级的安全阀**。一旦已经向用户吐出 token（或工具调用、或终态），再切模型会产生"半截 A + 完整 B"的脏回答。`StreamChunk.isFallbackMarker` 字段是为将来给前端提示"已切换"预留的（目前消费方未处理）。

## 4. 两级缓存

| 缓存 | 位置 | 键 | 命中效果 |
| --- | --- | --- | --- |
| **Prompt Cache** | Provider 侧（Qwen 支持） | `prompt_cache_key`（3 段前缀识别） | 降低输入计费 |
| **Answer Cache** | Redis（`SemanticCacheService`） | 精确指纹：租户 + 用户 + 消息 + 工具 + maxTokens + provider/model + `ANSWER_CACHE_REVISION` | **0 次模型调用、0 token**，`provider='semantic_cache'` |

Answer Cache 的三个前提（`answerCacheContext`）：

1. 必须有 `scope.userId`（**不接受调用方自报身份**）
2. `params.tools?.length` 为 0（带工具的请求不缓存）
3. 额度策略可得（`quota.getAnswerCacheLimits()`）

改缓存行为时记住：**指纹里包含 provider 与 model**，所以新增 GPT 不会与 Qwen 的缓存串味——但反过来，切模型会让缓存命中率骤降。`ANSWER_CACHE_REVISION` 是全局失效开关。

## 5. 额度与计价：这个项目的"钱袋子"

### 5.1 额度

```ts
private async quotaChat(provider, params, onPrepared?) {
  const prepared = await this.quota.reserveLlm(params);  // 预留
  onPrepared?.(prepared);                                // 记录实际 maxTokens
  return provider.chat(prepared);
}
```

- **先预留，再调用，后结算**（`reserveLlm` → `settleAuxiliary` / 记账）
- 预留会**裁剪 `maxTokens`**，所以缓存复用时必须校验 `preparedMaxTokens === cache.maxTokens`

### 5.2 计价目录

`llm-pricing-catalog.service.ts`（294 行）内置 `BUILTIN_CATALOG`：

```ts
{
  catalogVersion: '...', currency: 'CNY', effectiveAt: '...',
  entries: [{
    provider: 'qwen', models: ['qwen-plus'],
    source: '<官方价目出处>', pricingBasis: '<计价口径>',
    tiers: [{ maxPromptTokens?, inputCnyPer1k, outputCnyPer1k, cachedInputCnyPer1k? }]
  }, ...]
}
```

返回值是**判别联合**，不是单纯数字：

```ts
{ status: 'available', totalCny, catalogVersion, calls: [...] }
{ status: 'unavailable', reasons: [...], calls: [...] }
```

**规则（写在源码注释里）**：费率变更必须**新增 `catalogVersion`**，并在验收报告记录账单抽样对账。`reconcile()` 会给出 `matched | mismatch` + `deltaRatio`。

### 5.3 辅助调用（embedding / rerank）

`auxiliary()` 有两条额外铁律：

```ts
if (bound.status !== 'available' || bound.totalCny > 0.05) throw new BadRequestException(...);
if (!Array.isArray(result.vector) || result.vector.length !== 1024) throw ...('Embedding返回无效向量，未写入题库');
```

- **单次辅助调用估算超过 ¥0.05 直接拒绝**（防止误传大文档烧钱）
- **embedding 必须是 1024 维**，否则拒绝入库 —— 这是一条硬编码的数据一致性保护

## 6. 可观测

| 手段 | 内容 |
| --- | --- |
| Langfuse | `logGeneration`（traceId、model、input/output、usage、是否 fallback、durationMs） |
| Metrics | `metrics.modelFetch(provider)` 包装 fetch；`getProviderStatus()` 暴露 provider 启停 |
| 结构化日志 | `logger.error({ event: 'provider_stream_failed', provider, status })` |
| 成本 | `SessionCostTracker`（会话级）+ `UsageLedger`（账本级，Postgres） |

## 7. 已知缺口（改模型前必读）

### 7.1 流式工具调用未实现

`types.ts` 里定义了 `StreamChunk.toolCall`，但**两个 Provider 都没有 `yield` 它**（`grep toolCall apps/api/src/modules/llm/providers/*.ts` 只命中 types.ts）。

影响：流式路径下，模型返回的 `delta.tool_calls` 被丢弃。当前面试主流程依赖的是**非流式工具执行 + 流式文本**的组合，所以问题没暴露；但接 GPT（更积极地使用并行 tool calls）时会放大。

### 7.2 Provider 联合类型硬编码 4 处

| 位置 | 内容 |
| --- | --- |
| `providers/types.ts` | `type LLMProviderName = 'qwen' \| 'deepseek'` |
| `llm.gateway.service.ts` | `providers` / `fallbackMap` / `providerEnabled` 初始化 |
| `agents/multi-agent/llm-gateway-chat-model.ts:39,80` | `provider: 'qwen' \| 'deepseek'` |
| `modules/metrics/metrics.service.ts:24` | `modelFetch(provider: 'qwen' \| 'deepseek' \| 'deepagents')` |
| `modules/agent-lab/agent-registry.service.ts:30` | 内置版本 `modelConfig.provider: 'qwen'` |

### 7.3 Agent 主路径写死 qwen

```ts
// modules/agent/multi-agent.service.ts:70
const providerName = 'qwen' as const;
```

也就是说：**面试 Agent 的图永远优先用 qwen**，deepseek 只在 qwen 抛错时被网关降级兜底。接 GPT 时，这一行必须改成从配置/版本读取（见 [08](./08-gpt-integration.md)）。

### 7.4 降级链是双向的

`qwen ⇄ deepseek` 互为 fallback。加入 GPT 后要重新设计降级顺序（不能形成"失败来回 ping-pong"），见 08 的矩阵。

---

[← 返回索引](./Home.md)　|　上一篇：[03 Agent 运行时](./03-agent-runtime.md)　|　下一篇：[05 · 数据与存储](./05-data-and-storage.md)
