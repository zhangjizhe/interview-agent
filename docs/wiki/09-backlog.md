# 09 · 待办与推进顺序

> **本文与 [`docs/project/TASKS.md`](../project/TASKS.md) 的分工**：
> `TASKS.md` 是**验收门**（P0/P1，"什么算完成"的判定口径，不可随意改写）；
> 本文是**开发任务分解**（"先做哪个、怎么拆、做完怎么验"），并承接 GPT 接入这条新线。
>
> 状态：`[ ]` 未开始 · `[~]` 进行中 · `[x]` 完成 · `[-]` 放弃（写明原因）

---

## A. 承接 TASKS.md 的 P0（先做，不改口径）

TASKS.md 的 P0 有五项，这里只写**从哪下手**，判定标准仍以 TASKS.md 为准。

- [ ] **A-1 完整候选黄金链**
  起点：`apps/api/src/modules/interview/controllers/interview-flow.controller.ts` + `evaluation.controller.ts`
  产物：简历→岗位→SSE→报告→训练→复测 的**一条可重放脚本**（建议落在 `scripts/e2e-*.sh`）
  注意：合成工程链路 + 真实模型质量要**分别**证明，不要混成一句话

- [ ] **A-2 全运行时状态**
  起点：`apps/web` 各页面 + 990 静态模板清单（`scripts/ci/generate-ui-inventory.mjs`）
  产物：空/单/多/条件/错误/键盘/三种宽度（1440/768/390）逐项展开记录
  红线：**无全分母不报覆盖率百分比**

- [ ] **A-3 Lab 剩余业务与完整 B1**
  起点：`modules/agent-lab/{evaluation,controlled-evolution,application}.*`
  产物：录制/实验/决策/审计/数据集/候选/评测/发布 逐状态双证据
  红线：不以"空 Registry"代替真实消费；信封/事件/能力要与 [REPLACEABLE_AGENT_CONTRACTS](../architecture/REPLACEABLE_AGENT_CONTRACTS.md) 对齐

- [ ] **A-4 真实质量与账单**
  前置：先核清历史未知账单与额度（README 提到 13/36 因额度失败、费用 ¥0.069285 已核验、中断调用费用未知）
  边界：单次 ≤ ¥0.5，新测试累计 ≤ ¥3
  红线：失败不发布；未知不记零

- [ ] **A-5 部署身份与恢复**
  产物：固定 SHA / 镜像 digest / 迁移版本 / 配置快照；当场备份 + 目标环境恢复演练
  红线：隔离环境恢复成功 ≠ 生产恢复证明

## B. 承接 TASKS.md 的 P1

- [ ] **B-1 工具/知识/记忆与 Bridge 恢复**（B2–B5 退出门、会话级快照、策略/遥测分离、孤儿 Run 持久恢复）
- [ ] **B-2 MCP / 管理员控制**（进程外持久化、多实例、逐服务协议、持久授权审计）
- [ ] **B-3 历史 16 题复用**（组织/embedding 来源确认 → 保留源迁入 → 持久收据 → 读回 → 浏览器；禁跨租户 fallback）
- [ ] **B-4 训练读取逐字段合同**（当前只拒绝非数组外层；岗位/推荐条目缺失或错字段的运行时校验与用户恢复需另立失败用例）
- [ ] **B-5 其他异步/错误边界**（简历上传、HITL、多页面实例共享 store）
- [ ] **B-6 CI 运行时维护**（Actions Node20 弃用、ubuntu-latest 迁移，独立核升级兼容性）
- [ ] **B-7 安全维护**（延续依赖审计/补丁完整性，保留 high 边界，不声明零漏洞）

---

## C. GPT 接入线（新增，与 A/B 并行但**独立成 PR**）

完整方案见 [08 · GPT 接入方案](./08-gpt-integration.md)。这里只列可执行任务。

### C-0 前置决策（不定就别开工）

- [ ] **决策：接入点** —— 官方 / Azure OpenAI / 企业网关（决定 `OPENAI_BASE_URL` 默认值与合规路径）
- [ ] **决策：使用范围** —— 只做 chat/reasoning，还是也要驱动工具循环（决定是否必须先补流式 toolCall）
- [ ] **决策：数据边界** —— 简历与面试原文能否出境（涉及 PII；`feat/pii-compliance` 分支已在处理）
- [ ] **决策：模型档位** —— 主模型 + 备用模型各是什么（决定计价目录条目）

### C-1 不花钱的三步（先做完）

- [ ] **C-1.1 配置命名空间**：`AppConfig.openai` + `.env.example` 四键
- [ ] **C-1.2 Provider 实现**：`providers/openai.provider.ts`
  照抄 qwen 的 `fetch: metrics?.modelFetch(...)`、`timeout: 30_000`、`maxRetries: 0`；
  **删掉** `prompt_cache_key` / `cache_control` / `embedText` / `rerank`
  验收：用 `scripts/ci/fixture-model-server.mjs` 跑契约测试通过（content / finishReason / usage 三类 chunk 顺序正确）
- [ ] **C-1.3 类型扩展（4 处）**：`types.ts` 的 `LLMProviderName`、网关三张 Map、`llm-gateway-chat-model.ts:39,80`、`metrics.service.ts:24`
  顺手：把四处字面量联合统一引用 `LLMProviderName`
  验收：`pnpm typecheck` + `lint --max-warnings 0` + `build`

### C-2 计价与额度（不做这步，真实调用会被拒）

- [ ] **C-2.1 计价目录新增条目 + bump `catalogVersion`**
  价格来源必须写官方页面 + 查阅日期；推理模型按最保守口径填 tier
  验收：单测 `estimateCall({ provider:'openai', model, promptTokens, completionTokens })` → `status: 'available'`
- [ ] **C-2.2 额度链路验证**（不调真实模型）
  验收：`reserveLlm` 不再因"费用未知"抛错；`UsageLedger` 能落下 RESERVED 记录（可用测试库断言）

### C-3 路由与降级

- [ ] **C-3.1 降级链改单向**：`openai → qwen → deepseek`，消除 ping-pong
- [ ] **C-3.2 `selectProvider` 场景化**：reviewer/planner/Lab 评测 → openai；出题/报告正文 → qwen；纯代码 → deepseek
  红线：保留 `providerEnabled` 检查与 `allowFallback === false` 语义
  验收：故障注入单测（mock provider 抛 401）→ 走下一家；`hasEmitted` 后不重放

### C-4 主路径去硬编码

- [ ] **C-4.1 `multi-agent.service.ts:70`** 的 `const providerName = 'qwen' as const` 改为读**版本** `modelConfig.provider`
  红线：不许改成读环境变量（会造成同版本行为漂移）
  验收：用 `qwen` 版本跑通一次现有流程，行为与改动前一致

### C-5 版本与评测

- [ ] **C-5.1 新增 Agent 版本**（如 `1.1.0-gpt`），`modelConfig.provider='openai'`、`fallbackProvider='qwen'`
  红线：**不改 1.0.0**
- [ ] **C-5.2 有界真实调用**（单次 ≤ ¥0.5）：1 条短 prompt；检查 Langfuse trace + `UsageLedger` 预留/结算两条记录
- [ ] **C-5.3 计价对账**：取一次真实账单与 `reconcile()` 结果比对，记录 `deltaRatio`
- [ ] **C-5.4（可选）Lab 评测**：在预算内跑冻结数据集；结论只写"该版本在该数据集上的表现"，不跨版本横比 Qwen 历史分

### C-6 若要让 GPT 驱动工具循环（取决于 C-0 决策）

- [ ] **C-6.1 补流式 tool call 聚合**：`streamChat` 里聚合 `delta.tool_calls` 的 `index/id/name/arguments` 增量，聚齐后 yield 单个 `toolCall`
  背景：`StreamChunk.toolCall` 已定义但**两个 Provider 都没 yield**（见 [04 §7.1](./04-llm-gateway.md)）
- [ ] **C-6.2 契约测试**：多工具并行场景下，chunk 序列可被消费者正确重组

---

## D. 技术债清单（勘察发现，随手可修）

| # | 位置 | 问题 | 建议 | 优先级 |
| --- | --- | --- | --- | --- |
| 1 | `providers/types.ts` / `llm-gateway-chat-model.ts` / `metrics.service.ts` / `agent-registry.service.ts` | provider 字面量联合重复 4 处 | 统一引用 `LLMProviderName` | 中（随 C-1.3 一起做） |
| 2 | `modules/agent/multi-agent.service.ts:70` | `providerName = 'qwen' as const` 硬编码 | 改版本驱动（C-4） | 中 |
| 3 | `providers/*.provider.ts` | `StreamChunk.toolCall` 定义了但从未产出 | 补聚合（C-6） | 中（取决于 GPT 用法） |
| 4 | `LabRun` | 无 `provider` / `model` 快照，只有 token 与费用 | 需 schema 变更，独立任务评估 | 中 |
| 5 | `prisma` | 遗留 Milvus 类型错误 3 个（不在当前迭代范围） | 单独立项清理 | 低 |
| 6 | `docs/WIKI.md`（38KB） | 2026-06-21 审计，接口数/模块行数/py-api 默认等已过期 | 加顶部"历史快照，见 docs/wiki"声明 | 低 |
| 7 | `docs/wiki/Home.md` | 原内容停留在 2026-06-26（27 接口、py-api 默认） | **已重写** → 本 wiki 索引 | 已完成 |
| 8 | `apps/py-api` | 实验性实现，与主路径功能不对齐 | 明确标注冻结或移除，避免重复维护 | 低 |

---

## E. 建议顺序（按依赖，不按日期）

```
C-0 决策
   └─► C-1（配置·Provider·类型）──► C-2（计价·额度）──► C-3（路由·降级）
                                                            └─► C-4（去硬编码）
                                                                   └─► C-5（版本·有界验证·对账）
                                                                          └─► C-6（如需工具循环）
A-4（真实质量与账单）  ← 与 C-5 共享预算纪律，建议同批做
A-1（黄金链）          ← 可独立推进，与 C 线不冲突
A-2 / A-3 / B-*        ← 按 TASKS.md 原有节奏
```

**为什么 C 在 A 前只做前三步**：C-1 ~ C-3 不花钱、不改主流程，却能让"是否真的接得上 GPT"这件事有确定答案。拿到答案再决定要不要为它花预算，比先改主流程再发现计价/合规走不通更省事。

---

## F. 完成定义（DoD）

一条任务算完成，必须同时满足：

- [ ] 代码改动 + 对应测试（新增分支至少 1 条失败用例）
- [ ] `lint --max-warnings 0` / `typecheck` / `build` 通过
- [ ] 相关验证已**实际执行**（未跑不写通过）
- [ ] diff 自查：无密钥、无本机绝对路径、无调试残留
- [ ] 同步 `docs/project/CURRENT_STATE.md` / `TASKS.md` / `THREAD_HANDOFF.md`
- [ ] 结论用词与证据强度匹配（fixture ≠ 真实模型效果；隔离恢复 ≠ 生产恢复）

---

## 变更记录

| 日期 | 变更 |
| --- | --- |
| 2026-11-03 | 建立本文；承接 TASKS.md 的 P0/P1，新增 GPT 接入 C 线（C-0~C-6）与技术债 D 表 |
