# Feature Development Workflow

```text
Product Spec
-> UX Spec
-> Technical Design
-> Implementation
-> Unit Test
-> Integration/API Test
-> E2E/Browser Test
-> Security Review
-> AI Evaluation（如适用）
-> Reviewer
-> Release
```

## 规则

- 只实现已经批准的范围。
- 先复用现有模块、服务和测试。
- 改变数据模型时必须有 migration、兼容性评估和回滚策略。
- 涉及 AI 调用时说明模型、调用次数、最大 Token、最大成本、失败路径和可观测字段。
