# 评价架构

最后更新：2026-08-13

## 当前状态

代码中有两条评价路径：

- 单题启发式评分计算正确性、深度、完整性、分数、反馈和建议，并可保存 `AnswerHistory`。
- 面试结束时，LLM 生成总体分、四个宽泛维度、优点、不足和建议，并保存 `Report`。

`AnswerHistory` 目前缺少技能 ID、期待证据、评估器版本、证据 Span，以及在同一条路径中可靠保存维度分数。`Report` 保存自由文本结果和 JSON scores。这不足以支撑长期、可解释的技能档案。

## 所需评价合同

```text
问题 -> 回答 -> 评估证据 -> 技能评估 -> 面试评价
```

`AssessmentEvidence` 最小字段：

- question ID/version、skill/sub-skill 和父问题 ID（追问时）
- answer ID、候选人 message ID 和不可变回答摘要/Span
- 期待证据与观察证据
- 分数、维度、理由、缺失证据和建议
- 不可变 `EvaluationDefinition` 版本：evaluator、prompt、rubric、provider、model、模型参数、运行模式和降级策略
- 创建时间、置信度、版本、状态、幂等键和 supersedes 引用

`SkillAssessment` 只能在明确方法/版本下聚合证据，记录分数、置信度、证据数量、最近评估时间和来源面试。

## 关系、不可变性与权威来源

当前 `InterviewTask` 和 `AnswerHistory` 仅依赖问题/回答文本快照，没有外键关系，不能作为回放、追问归因和审计的长期事实。P0-1 必须建立：

```text
Interview
  -> InterviewQuestion（可追溯到 InterviewTask/生成来源）
  -> InterviewAnswer（关联候选人 Message）
  -> AssessmentEvidence（关联问题、回答和 EvaluationRun）
  -> SkillAssessment
```

- Question、Answer 和 Evidence 发布后不可原地修改；修订/重评以新版本追加，并通过 `supersedesId` 链接。
- `EvaluationDefinition` 以不可变版本或内容哈希封装 evaluator、Prompt、Rubric、Provider、Model、模型参数、
  `FINAL`/`PRACTICE`/`PREVIEW` 模式和降级策略；任何一项变化都必须产生新定义版本。
- `EvaluationRun` 记录输入修订、评估定义版本、幂等键、运行状态、错误和降级信息。幂等范围是
  `interviewId + inputRevision + evaluationDefinitionVersion + evaluationMode`，因此 Prompt 更新或模型切换不会误命中旧运行。
- 结束面试的最终评价是写入正式 Report 与 Skill State 的唯一权威生产者。
- 单题评价 API 只服务 `PRACTICE` 或 `PREVIEW`，不能覆盖最终 Report 或正式 Skill State。
- 同一输入版本重复执行必须幂等；重跑必须明确是同版本重试还是新版本再评价。

当前两个可更新同一 `Report` 的路径必须在 P0-1 收敛：`EvaluationController` 的生成报告路径不能与
结束面试路径以不同口径静默覆盖同一个最终结果。

## Report 历史策略

采用“单一展示快照 + 不可变 EvaluationRun 历史”：

- `EvaluationRun` 保存完整 Report Payload、证据、评估定义和运行状态，是审计、回放和重跑的权威历史。
- 现有 `Report.interviewId` 唯一记录继续保留，但仅代表候选人当前展示快照，并新增
  `currentEvaluationRunId` 指向已成功的最终评价运行。
- 切换展示快照必须显式记录来源运行和时间；不得以 `upsert` 用新的评分口径覆盖历史完整结果。
- `FAILED` 或未批准的 `DEGRADED` 运行不得成为当前展示快照或技能状态来源。

## 准备度估计

岗位准备度只有在每个构成项具备明确权重、证据数和岗位档案版本后，才能综合简历证据、技能覆盖和面试表现。它是估计值，不是招聘预测。P0 UI 必须披露构成项和低置信度状态。

## 安全规则

评估器可以评价回答，但不能修改自身生产 Prompt 或自行发布。所有评估器/Prompt 改动必须经过 Harness 与发布门。
