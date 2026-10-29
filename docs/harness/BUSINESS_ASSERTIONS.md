# 确定性业务合同评测

2026-10-29。此合同检查输出字段和受限必要事件，不证明面试语义质量、评分准确性或训练提升。当前实现/验收状态见 [证据](../acceptance/EVALUATION_QUALITY_GATE_EVIDENCE.md)。

## 真实使用入口

管理员进入独立 Lab 的“自进化 → 配置评测资产”，选择“确定性业务合同”，创建 Evaluator 和 Dataset Cases。普通 Web 的 Lab 评测页也支持同一类型。所有资产写入已有工作区/组织隔离的 PostgreSQL 表；API ADMIN 权限不变。

Evaluator API `POST /api/agent-lab/evaluators`：

```json
{
  "key": "interview-business-contract",
  "name": "结构化决策合同",
  "type": "BUSINESS_ASSERTIONS",
  "config": {"contractVersion": "business-assertions/v1"}
}
```

Case 的 `expectedOutput` 示例（输入应明确要求模型返回这样的 JSON；不能将合成样例称为真实质量样本）：

```json
{
  "contractVersion": "business-assertions/v1",
  "assertions": [
    {"id": "score-range", "source": "response-json", "path": ["score"], "op": "number-range", "minimum": 0, "maximum": 1},
    {"id": "decision", "source": "response-json", "path": ["decision"], "op": "equals", "expected": "FOLLOW_UP"}
  ]
}
```

`response-json` 解析真实 `Run.output.response` 字符串；不会在 JSON 失败时改用关键词凑通过。支持 `exists`、原始值 `equals`、有限数 `number-range`、`array-length`、字面 `text-excludes`。路径最多8段且只读自有属性；拒绝 prototype/constructor 等路径、任意代码、表达式与正则。每 Case 1–32条断言，输出JSON最多64KiB并有深度/节点/数组上限。所有必需断言通过才记100，否则0，不用均分掩盖失败。

Trace 只允许 configured single 的 `model.start/end`、finite workflow 的 `workflow.node.start/end` 正向 `event-exists`（可选step）。查询真实当前工作区/Run事件并保存runId/seq引用。至少同时有一个输出断言；不支持据空Trace判断“未调用禁止工具”，不声称全轨迹完整。

## 执行与发布

先添加至少10个有分层及来源声明的 Cases，冻结并由管理员逐条审查；再选同一 Evaluator，提交3–5次重复评测与显式费用停止阈值。1–2次探索评测也有最多50 Case及服务端不高于3CNY的预算停止阈值。费用未知/运行异常停止后续样本；在途样本可能超过停止阈值，不能解释为预付硬总额保证。

队列提交需要完整回执才确认成功。未确认提交按用户与资产签名在当前标签页sessionStorage保留幂等键，刷新/组件卸载后同资产重试复用；存储不可用时请求不发送。不承诺跨标签页/设备的用户意图去重。服务端继续验证真实登录主体、工作区、请求内容和唯一requestKey。

结果详情显示逐项断言、失败原因、引用与指纹。服务端生成 `qualityEvidence`，客户端/Case metadata不能自行声明语义已校准。`release-gate/v6` 在既有冻结、重复、分层、资源与统计门上追加实际business evidence和基线contractHash一致检查。旧关键词/结构/延迟评测可以运行，但不能独立授权新发布。既有bootstrap/already-published兼容路径不被追认质量通过。

## 迁移与部署

加性迁移 `20261029000000_business_assertions_evaluator` 为 EvaluatorType 新增枚举。先按既有 migration entrypoint部署迁移，再部署API与两端UI；readiness会检查迁移目录。不要在旧Prisma客户端/未迁移数据库上启用新类型。无数据重写或组织归属改变；回滚应用不删除新历史或枚举值。

真实 Interview 语义任务、专家标注/仲裁与Judge校准仍是下一步，不能通过关键词换名或填一项schema就认为已完成。
