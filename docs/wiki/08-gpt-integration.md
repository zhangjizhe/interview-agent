# 08 · GPT 接入方案

> 结论先说：这个项目接 GPT **不是"换个 API Key"**，而是**新增一个 Provider，并让它在版本、额度、计价、证据四套机制里合法存在**。
> 协议层零成本（`qwen` / `deepseek` 都走 OpenAI 兼容协议），真正的成本在下面 7 处改动点和 1 个硬约束。

---

## 1. 现状：已经是多 Provider 架构，但只有两家

| 事实 | 位置 |
| --- | --- |
| Provider 抽象 `BaseLLMProvider`（`name` / `defaultModel` / `chat` / `streamChat`） | `apps/api/src/modules/llm/providers/base.provider.ts` |
| 两个实现都基于 `openai` SDK + `baseURL` | `providers/qwen.provider.ts` · `providers/deepseek.provider.ts` |
| 联合类型写死两家 | `providers/types.ts`：`type LLMProviderName = 'qwen' \| 'deepseek'` |
| 路由 + 降级 + 永久错禁用 + 缓存 + 额度 + 计价 | `llm.gateway.service.ts`（451 行） |
| LangGraph 通过适配器走网关 | `agents/multi-agent/llm-gateway-chat-model.ts` |

所以接入 GPT 的**增量**是：一个 Provider 类 + 6 处类型/装配 + 1 条计价记录 + 1 条配置。

---

## 2. 七处改动点（按依赖顺序）

### 改动 1 · 配置命名空间

`apps/api/src/infra/config/configuration.ts` 的 `AppConfig` 增加：

```ts
openai: {
  apiKey: string;
  baseUrl: string;      // 必须可配，不要硬编码 api.openai.com（见 §8）
  model: string;
};
```

`.env.example` 增加：

```bash
# ─── 模型：OpenAI / GPT ───
OPENAI_API_KEY=
OPENAI_BASE_URL=            # 官方 / Azure / 网关地址，三者都靠它切换
OPENAI_MODEL=
OPENAI_MAX_TOKENS=          # 可选，推理模型要给足输出预算
```

**为什么 `baseUrl` 必须可配**：国内直连 `api.openai.com` 不通，实际落地大概率是 Azure OpenAI 或企业网关。把它写死等于方案不可用。

### 改动 2 · Provider 实现

新建 `apps/api/src/modules/llm/providers/openai.provider.ts`，以 `qwen.provider.ts` 为模板，但**去掉三样 qwen 特有的东西**，补一样 GPT 特有的：

| 项 | 处理 | 原因 |
| --- | --- | --- |
| `prompt_cache_key` / `cache_control` 透传 | **删掉** | OpenAI 官方 prompt caching 是自动的，传这些参数无效甚至 400 |
| `embedText`（1024 维） | **删掉** | 见 §6 硬约束 |
| `rerank` | **删掉** | OpenAI 无对应接口（本项目用 qwen 的 `gte-rerank-v2`） |
| `response_format` / `strict` schema | **可加** | GPT 支持严格 JSON Schema，这是它相对 qwen 的真实优势 |

必须保留的两处（照抄 qwen 的实现）：

```ts
this.client = new OpenAI({
  fetch: metrics?.modelFetch('openai'),   // ← 指标埋点，漏了就没有这条曲线
  apiKey, baseURL,
  timeout: 30_000,
  maxRetries: 0,                          // ← 重试必须回网关重新记账
});
```

### 改动 3 · Provider 联合类型（4 处，容易漏）

| 文件 | 改什么 |
| --- | --- |
| `providers/types.ts` | `LLMProviderName` 加 `'openai'` |
| `llm.gateway.service.ts` | `providers` Map、`fallbackMap`、`providerEnabled` 三处初始化 + 构造函数注入 |
| `agents/multi-agent/llm-gateway-chat-model.ts:39,80` | `provider: 'qwen' \| 'deepseek'` → 引用 `LLMProviderName`（**顺便消除重复定义**） |
| `modules/metrics/metrics.service.ts:24` | `modelFetch(provider: 'qwen' \| 'deepseek' \| 'deepagents')` 加 `'openai'` |

> 建议：这四处都改成引用同一个 `LLMProviderName`，别各自维护字面量联合。这是本次改动最值得顺手做的重构。

### 改动 4 · 网关路由与降级链

现状是**双向**降级：

```ts
fallbackMap = new Map([['qwen','deepseek'], ['deepseek','qwen']]);
```

加第三家必须改成**单向链**，否则会出现 `openai → qwen → openai` 的来回 ping-pong：

```ts
// 建议：按"能力/成本"排序的单向链
const FALLBACK_CHAIN: Record<LLMProviderName, LLMProviderName | undefined> = {
  openai:   'qwen',
  qwen:     'deepseek',
  deepseek: undefined,
};
```

`selectProvider` 也要调整。当前是「技术题 → deepseek，其余 → qwen」，加 GPT 后建议改成**场景化**：

```
需要强工具调用 / 复杂推理（reviewer、planner、Lab 评测） → openai
长文生成、成本敏感（出题、报告正文）                    → qwen
纯代码题                                               → deepseek
```

并且**必须保留**现有两条保护：`providerEnabled` 检查（禁用者不选）、`allowFallback === false` 时不降级。

### 改动 5 · 计价目录（不做这一步，GPT 调不通）

这是本项目最容易踩的坑。`LlmPricingCatalogService.estimateCall()` 对**未登记的 provider/model 返回 `unavailable`**，而额度预留链路会因此拒绝调用：

```
estimateCall → unavailable → quota.reserveLlm 抛错 → 请求失败
```

所以必须在 `BUILTIN_CATALOG` 增加条目，并**新增 `catalogVersion`**：

```ts
{
  provider: 'openai',
  models: ['<你的模型名>'],
  source: '<官方价目页 URL + 查阅日期>',
  pricingBasis: '<计价口径：按量 / 高峰价 / 是否含缓存折扣>',
  tiers: [{ inputCnyPer1k: ..., outputCnyPer1k: ..., cachedInputCnyPer1k: ... }],
}
```

三条纪律（源码注释里已有，照做）：

1. 费率变更**必须**新增 `catalogVersion`，不许原地改；
2. 验收报告要记录**账单抽样对账**结果（`reconcile()` 给 `matched | mismatch` + `deltaRatio`）；
3. 价格必须来自**官方公开页面**并标注查阅日期，不能凭记忆填。

> 推理型模型（o 系 / gpt-5 系）的计费口径不同：推理 token 计入 completion，且无缓存折扣。填 tier 时要按最保守口径，否则成本会被低估。

### 改动 6 · Agent 主路径去掉写死的 qwen

```ts
// apps/api/src/modules/agent/multi-agent.service.ts:70
const providerName = 'qwen' as const;      // ← 现状：Agent 永远优先 qwen
```

改成从**版本配置**读，而不是从环境变量读：

```ts
const version = ...;                        // 当前 LabAgentVersion / AgentVersion
const providerName = version.modelConfig.provider;   // 'openai' | 'qwen' | 'deepseek'
```

原因见 §5：**模型身份是版本的一部分**，从 env 读会让"同一版本行为漂移"，破坏证据链。

### 改动 7 · 内置 Agent 版本（不要改老版本）

`modules/agent-lab/agent-registry.service.ts:30` 的 `INTERVIEW_AGENT_VERSION = '1.0.0'` 里写着：

```ts
modelConfig: { provider: 'qwen', model: 'qwen-plus', fallbackProvider: 'deepseek' }
```

**正确做法**：新增一个版本（如 `1.1.0-gpt`），`modelConfig.provider = 'openai'`，`fallbackProvider = 'qwen'`。
**错误做法**：把 1.0.0 的 provider 改掉——历史运行记录的模型身份就说不清了。

---

## 3. 改动面汇总

| # | 文件 | 类型 | 风险 |
| --- | --- | --- | --- |
| 1 | `infra/config/configuration.ts` + `.env.example` | 新增配置 | 低 |
| 2 | `providers/openai.provider.ts` | 新文件 | 中（契约要对） |
| 3 | `providers/types.ts` · `llm.gateway.service.ts` · `llm-gateway-chat-model.ts` · `metrics.service.ts` | 类型扩展 | 低（漏一处就编不过） |
| 4 | `llm.gateway.service.ts` 路由/降级链 | 逻辑改动 | **中高**（ping-pong 风险） |
| 5 | `cost/llm-pricing-catalog.service.ts` | 新增条目 + 版本 | **高**（漏了直接调不通） |
| 6 | `modules/agent/multi-agent.service.ts:70` | 去硬编码 | 中（影响主流程） |
| 7 | `modules/agent-lab/agent-registry.service.ts` | 新增版本 | 低 |

---

## 4. 分阶段落地（每步都能独立验收）

| 阶段 | 内容 | 验收 | 是否花钱 |
| --- | --- | --- | --- |
| **S0** | 写 `openai.provider.ts`，用 `scripts/ci/fixture-model-server.mjs` 假服务器跑契约测试 | provider 契约测试通过；`streamChat` 能正确 yield content/finishReason/usage | 否 |
| **S1** | 类型扩展 + 网关装配（不启用路由） | `pnpm typecheck` / `lint` / `build` 通过；`getConfiguredModels()` 能列出三家 | 否 |
| **S2** | 计价目录新增条目 + bump version | 单测：`estimateCall({provider:'openai',...})` 返回 `available` | 否 |
| **S3** | 单次真实调用（有界预算） | 1 条短 prompt 成功；实际费用 ≤ ¥0.5；Langfuse 有 trace；`UsageLedger` 有记录 | 是（<¥0.5） |
| **S4** | 路由 + 降级链切换 | 故障注入：禁用 openai → 自动走 qwen；`hasEmitted` 后不重放 | 是（少量） |
| **S5** | 新版本 + Lab 评测（可选） | Lab 出一个 `modelProvider='openai'` 的版本；有界预算内完成；费用可核验 | 是（受预算约束） |

**S0–S2 完全不烧钱**，先把这三步做干净，再进 S3。

---

## 5. 证据链怎么处理（本项目最特殊的一点）

这个项目的核心资产是"证据"，所以接模型必须回答：**换了模型，历史结论还成立吗？**

现状：

```
LabAgentVersion.modelProvider / modelVersion   ← 有（可选字段）
LabRun.provider / model                        ← 没有（只有 tokens + estimatedCostCny）
```

三个必须坚持的做法：

1. **模型写进版本，不写进环境变量**。同一版本换 env = 行为漂移，历史运行无法归因。
2. **A/B 用两个版本，不用一次运行切两次模型**。`LabExperiment` 的 `CONTROL` / `TREATMENT` 臂各自绑版本。
3. **不要用 Qwen 的历史分数和 GPT 的新分数直接比**。Prompt、缓存策略、tokenizer、工具调用倾向都不同，只能同版本同数据集重跑对比。

> 如果需要"同一版本内换模型对比"，得给 `LabRun` 加 `provider` / `model` 快照字段（schema 变更 + 迁移 + 旧数据回填策略）。这属于独立任务，别顺手塞进接入 PR。

---

## 6. 硬约束：不要换 embedding

```ts
// llm.gateway.service.ts:175
if (!Array.isArray(result.vector) || result.vector.length !== 1024) throw ...('Embedding返回无效向量，未写入题库');
```

- 现有 embedding 是 qwen `text-embedding-v3`，**1024 维**，且这个维度在网关里是硬校验
- 存量题库、Qdrant / Milvus 集合、历史 16 题迁移都基于 1024 维
- 换 OpenAI embedding（1536 维）= **全量重建索引 + 双写灰度 + 迁移脚本**，工作量远大于接 GPT 本身

**建议**：GPT 只用于 chat / reasoning，embedding 与 rerank 继续走 qwen。这在架构上完全成立——`auxiliary()` 本来就只认 qwen。

---

## 7. 流式工具调用：接入前要评估的既有缺口

`StreamChunk` 里定义了 `toolCall`，但两个 Provider 都**没有 yield 它**：

```bash
grep -rn "toolCall" apps/api/src/modules/llm/providers/*.ts
# 只命中 types.ts，两个实现里都没有
```

影响评估：

- 当前面试主流程是「非流式工具执行 + 流式文本」，所以问题没暴露
- GPT 更倾向**并行工具调用**（一次返回多个 `tool_calls`），一旦走流式工具路径，`delta.tool_calls` 会被丢弃
- 修法：在 `streamChat` 里聚合 `delta.tool_calls[].index / id / function.name / function.arguments` 的增量片段，聚齐后 yield 一个完整 `toolCall`

**建议**：如果 GPT 只用在"生成文本"场景（出题、报告、reviewer 打分），可以先不处理；一旦要让 GPT 驱动 executor 的工具循环，必须先补这块并加契约测试。

---

## 8. 网络、合规与参数陷阱

### 8.1 接入点选择

| 方案 | 可用性 | 代价 |
| --- | --- | --- |
| 官方 `api.openai.com` | 国内需代理 | 不稳定，不适合当默认路径 |
| **Azure OpenAI** | 可直连（区域可选）、企业合规 | 需订阅、模型上线有滞后 |
| 企业网关 / 中转 | 灵活 | 数据经第三方，**不能默认用于候选人简历等 PII** |

这个项目处理简历、面试对话等个人数据，`docs/` 里已有 `feat/pii-compliance` 分支痕迹——**接 GPT 前要先过数据出境这一关**，不能只按技术可行性决定。

### 8.2 参数陷阱（推理型模型）

| 陷阱 | 现象 | 处理 |
| --- | --- | --- |
| 不支持 `temperature` | 400 unknown parameter | 该 provider 不传 `temperature`（qwen 实现里默认 `?? 0.7`，要条件化） |
| `max_tokens` 改名 | 400 | 用 `max_completion_tokens`；SDK 对 `maxTokens` 有映射，需实测 |
| 首字延迟高 | 用户以为卡死 | SSE 已有流式，但要加"思考中"状态；或推理档位只给 reviewer |
| 推理 token 计费 | 账单高于预期 | tier 按保守口径填；预算软停止要能兜住 |

### 8.3 并发与限流

三档 `THROTTLER_*` 是按现有 Provider 的打点调过的。GPT 的 RPM/TPM 限制不同，切换后要复核 `_SSE_LIMIT`，否则会出现"接口没超限但 Provider 侧 429"。

---

## 9. 验收清单（做完才算接完）

| # | 用例 | 期望 |
| --- | --- | --- |
| 1 | fixture 契约测试（S0） | `streamChat` 输出 content / finishReason / usage；finish 顺序正确 |
| 2 | `estimateCall` 返回 `available` | 计价目录命中新版本号 |
| 3 | 单次真实调用 | 成功；费用 ≤ ¥0.5；`UsageLedger` 有预留 + 结算两条记录 |
| 4 | Langfuse trace | 有 `llm.openai`（或 `.fallback`）的 generation 记录 |
| 5 | 故障注入：401 | provider 被永久禁用，`getProviderStatus()` 可见原因，下次直接走 fallback |
| 6 | 故障注入：流中断 | **不重放**（`hasEmitted` 生效），前端收到错误而非拼接脏文本 |
| 7 | 缓存隔离 | Qwen 的缓存不会命中 GPT 请求；`ANSWER_CACHE_REVISION` 未变 |
| 8 | 版本固化 | 新 `LabAgentVersion` 的 `modelProvider='openai'`；老版本不变 |
| 9 | 评测预算 | 到达 `AGENT_LAB_MAX_EVALUATION_COST_CNY` 时在样本边界停止；费用如实小计 |
| 10 | 类型完整 | `pnpm typecheck` / `lint --max-warnings 0` / `build` 全绿 |

---

## 10. 不建议做的事

| ❌ 不要 | 原因 |
| --- | --- |
| 直接改 `1.0.0` 版本的 `modelConfig` | 历史运行模型身份失真，证据链断裂 |
| 用 env 变量决定 Agent 用哪个模型 | 同版本行为漂移，评测结论不可比 |
| 把 `api.openai.com` 硬编码进 provider | 国内不可用，等于交了份跑不通的代码 |
| 同步换 embedding | 1024 维硬约束 + 全量索引重建，风险远大于收益 |
| 在 GPT 未进计价目录时先跑真实评测 | 会被额度链路拒绝；绕过它则费用记不上账 |
| 让降级链双向 | openai ⇄ qwen 会 ping-pong，首字延迟翻倍 |
| 用中转网关处理简历/面试原文 | PII 出境风险 |

---

## 11. 一句话总结

**协议层没有难度，难度在于"让新模型在计价、额度、版本、证据里都合法"**。按 S0→S5 走，前三步不花钱，第四步起每步都有明确预算上限，这样接 GPT 不会把这个项目最值钱的"证据可追溯"弄坏。

---

[← 返回索引](./Home.md)　|　上一篇：[07 开发与运维](./07-dev-and-ops.md)　|　下一篇：[09 · 待办与推进顺序](./09-backlog.md)
