# 版本化模型费率证据验收报告

日期：2026-10-05

任务：`LAB-PRICING-EVIDENCE-4`

分支：`agent-lab`

## 交付结果

- 新增集中式 `LlmPricingCatalogService`，按实际 Provider、Model、输入阶梯和缓存输入生成 CNY 成本证据；每份证据携带目录版本、官方来源和计价口径。
- Multi-Agent Runtime 不再把 Qwen 单价套用到所有调用，Gateway 同步与流式响应均透传实际 Provider/Model。
- Session Cost 在每次调用发生时累计版本化成本；任一有计费 Token 的未知模型会把会话成本标为 `unavailable`，对外返回 `estimatedCostCny: null`。
- DeepSeek 默认模型更新为当前受支持的 `deepseek-flash`；完整目录可由 `LLM_PRICING_CATALOG_JSON` 覆盖，无效配置启动即失败。
- Prisma 增加 `costStatus` 与 `pricingCatalogVersion`，历史行默认不可用，避免把旧的通用单价结果误认为新证据。

## 定价依据

- Qwen Plus：阿里云百炼官方价格页，华北 2（北京）非思考模式按单次输入 Token 阶梯计价：<https://help.aliyun.com/zh/model-studio/qwen-plus>
- DeepSeek：官方定价页，目录使用工作日高峰价格进行保守估算：<https://api-docs.deepseek.com/zh-cn/quick_start/pricing/>
- DeepSeek 模型合同：<https://api-docs.deepseek.com/zh-cn/api/list-models/>

费率属于外部时变事实。后续调整必须新增目录版本并重新执行测试和账单抽样对账，不能原地修改既有证据的含义。

## 验证证据

- 费率目录、Gateway usage 与 Session Cost 定向测试：3 suites / 10 tests passed。
- API Jest：71 suites passed、2 skipped；523 tests passed、14 skipped。
- Cache：22/22 passed。
- lint：0 errors，保留 4 条历史 warnings。
- root typecheck：passed。
- root build：passed。
- Prisma generate / validate：passed。
- Docker：migration job exited 0；API、Agent Lab healthy；`20261005000000_versioned_llm_pricing` 已登记并核验两列存在。
- Provider 启动健康检查：Qwen 与 DeepSeek 均返回 OK；未运行批量真实模型评测。

## 商用边界

- 当前成本是依据公开费率和实际 Token 的工程估算，不是扣款、发票或财务账单。
- 已实现账单样本容差对账函数并通过确定性测试，但本轮没有可用真实账单样本，因此不声明财务对账通过。
- DeepSeek 分时价格会变化；目录选用高峰价作为保守值。Qwen 地域、模式或超长上下文变化时必须选择对应费率版本。
- 本次不改变 Provider 路由、额度扣减、自动发布或候选人产品流程。
