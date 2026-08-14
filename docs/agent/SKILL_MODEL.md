# 候选人技能模型

最后更新：2026-08-13

## 目的

候选人技能分数是已评估证据的压缩表示，不是真实能力的绝对断言。

```text
技能分数 + 置信度 + 趋势 + 证据数量 + 最近评估时间 + 证据链接
```

## 建议领域模型

| 实体 | 最小字段 | 来源 |
| --- | --- | --- |
| SkillDefinition | id、名称、父级、适用岗位、taxonomy version | 产品维护的技能分类 |
| JobSkillRequirement | target job id、skill id、重要度、期待级别、来源 | JD/岗位分析 |
| AssessmentEvidence | user、interview、question、answer、skill、score、期待/观察证据、evaluator version | 评价流水线 |
| CandidateSkillState | user、target job、skill、score、confidence、trend、evidence count、last assessed | 聚合任务 |
| TrainingRecommendation | skill、reason/evidence ids、objective、practice type、status | 推荐引擎 |

## 聚合规则

- 按 user + active target job + skill taxonomy version 聚合。
- 偏好最近且可比的证据，但保留证据链接以支持回放。
- 置信度来自独立证据覆盖与评估一致性，不能因重复同一回答而增长。
- 趋势只比较可比技能评估，不能随意比较不同面试总分。
- 低于产品定义证据阈值的技能显示为 `insufficient evidence`，而不是被认定为已证明的弱项。

## 迁移边界

不要向 `User` 或 `Report` 添加泛化的 `skills Json` 字段。应使用规范化、用户归属的记录，并以来源面试外键和适合用户/岗位/技能趋势查询的索引支撑。
