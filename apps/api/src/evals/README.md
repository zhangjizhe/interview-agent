# Golden 评分合同评测

更新2026-10-29。数据文件1.0.0含30题、60个参考回答。它是现有参考资产，不据样本数推断统计充分，也未证明独立人工双评或生产评分准确性。

## 当前实现

`EvalRunner` 与实际 `DynamicTaskQueueService.agentDecide` 共用 `interview-decision/v1` 的请求构造及有界结构解析。生产0–1评分转换为报告0–100分；不额外发明另一个加权评分Prompt。生产无效决策降级为明确非模型来源；Golden评测将无效决策保留为失败，不把兜底结果算模型成功。

报告包括 MAE、相关性、档位/关键词一致率、三维误差、预期/尝试/有效/错误样本及覆盖率、实际模型/Provider、Prompt hash和合同版本。调用错误、非有限/越界字段、缺样本、空样本或旧合同不能通过；不得只展示成功子集证明质量。模型/费用未知不填默认值。数值阈值是当前工程规则，不代表已被独立业务校准。

## Provider-free 校验

```sh
corepack pnpm@9.0.0 --filter api eval:validate
corepack pnpm@9.0.0 --filter api test:jest --runInBand golden-dataset.eval.spec.ts golden-evaluation-contract.spec.ts agent-lab-recording.spec.ts
```

部分受限环境不允许tsx CLI创建IPC pipe，可以在apps/api目录用 `node --import tsx src/evals/eval-runner.ts --validate`；同样仅校验schema，不运行模型。

## 真实模型执行边界

旧版默认直连Qwen的CLI已移除，因为它绕过统一预算、用量和费用证据。裸执行/仅配置API Key不会发起付费请求；不会用一次外部失败继续无界跑全量。受审计的服务端执行器可以注入scorer调用Runner，但必须自行提供认证主体/配额/预算/usage，当前没有完成该真实执行器验收。共享请求/解析不等于真实生产评分已校准。

`runGoldenCli` 对执行器的FAIL结果返回非零状态；当前默认CLI仅允许 `--validate`。CI的合成scorer测试检查执行/报告合同，不是实际模型能力门禁。

## Recorded 导入

`toAgentLabRecordedRun` 拒绝FAIL、缺失/旧合同、错误或不完整样本，以及缺真实资源证据的报告。不得将未知Token/费用伪造为0。当前Runner不制造resourceEvidence，因此其报告不能直接升级为可发布Recorded证据；录制导入仍与真实Agent发布分离。

## 下一步

先建立独立专家双评、分歧仲裁、证据准确率与过度/不足评分参考，再接受预算约束的真实生产评分校准。新旧Prompt合同不可混用历史报告。Lab确定性业务评测的可用入口见 [BUSINESS_ASSERTIONS](../../../../docs/harness/BUSINESS_ASSERTIONS.md)。
