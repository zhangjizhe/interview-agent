# 题目智能

最后更新：2026-08-13

## 当前状态

题目生成使用简历上下文，返回 category、difficulty、expected points 和 follow-up hints。题库支持按岗位/职级/分类搜索和管理员导入。当前持久化缺少可用于选择策略的稳定题目分类、质量分和候选人使用历史。

## 所需题目合同

```text
question_id, version, role, skill, sub_skill, difficulty,
expected_evidence, common_failure, follow_up_strategy,
source, quality_score, status
```

来源必须区分精选、导入和生成。质量是需审查/审计来源支撑的运营度量，不是模型自我断言。

## 选择策略

P0 中，先检索有界候选集，再按以下顺序排序：

1. 当前目标岗位和岗位要求技能；
2. 影响最大的已评估能力缺口；
3. 用户选择的练习模式；
4. 与当前证据适配的难度；
5. 题目历史和最近使用情况；
6. 来源/质量是否符合要求。

不得把整个语料库加载进 Prompt。题目选择必须保留现有检索限制和成本控制。
