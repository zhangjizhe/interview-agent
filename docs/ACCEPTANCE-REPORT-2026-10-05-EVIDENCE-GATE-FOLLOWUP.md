# 发布证据门真实验收加固报告

日期：2026-10-05

分支：`agent-lab`

任务：`LAB-EVIDENCE-GATE-3`

## 交付内容

- API 对 `repeatCount >= 3` 的评测要求 Dataset 同时具备冻结时间和内容指纹，避免把可变数据生成的结果误作发布证据。
- Agent Lab 在 Dataset 冻结前禁用“评测当前基线”和“评测候选”，并显示先冻结的操作提示。
- 保留 `repeatCount = 1` 的探索性评测，不改变现有发布算法、数据模型和人工发布边界。

## 真实环境验收

- `docker compose up -d --build migration api agent-lab` 成功；migration 正常退出，API healthy，Agent Lab 正常运行。
- 复用既有管理员会话冻结 `Interview 失败探针 1.0.0`，页面返回内容指纹 `sha256:3e44457bff06fe37703f6ad349010bda00ad37247e8568cd4561fdd95a701607`。
- 冻结后“添加 Case 到当前 Dataset”和“冻结当前 Dataset”均禁用，数据集状态显示“已冻结”。
- 冻结后完成三次当前基线评测，页面返回 0 分；该结果只证明执行闭环和失败证据，不代表模型质量改善。
- 冻结前曾成功启动一次三次基线评测，由此发现本次修复的问题；该次结果不满足发布证据条件。
- 修复后的最终镜像中切换到可编辑 Dataset，基线与候选评测按钮均为禁用，先冻结提示可见。

## 自动化验证

- API Jest：70 suites passed，516 tests passed，14 skipped。
- `evaluation.service.spec.ts`：9/9 passed，包含未冻结三次评测拒绝回归。
- Cache：22/22 passed。
- Agent Lab build：通过。
- 全仓 lint：0 error，4 条历史 warning。
- 全仓 typecheck/build：通过。

## 边界与后续

- 点击“评测候选”时，浏览器自动审批服务因容量不足未完成审批，动作未执行；本报告不把候选评测、同集比较或发布按钮状态记为通过。
- 未发布候选版本，未改变当前 Interview Agent 版本。
- 下一独立任务建议建立版本化 Provider/Model 费率表与账单抽样对账；业务 Dataset 的分层统计和显著性判断另行规划。
