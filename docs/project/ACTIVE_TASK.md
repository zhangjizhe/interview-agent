# 当前任务

更新：2026-10-19 · PRODUCT-REACCEPTANCE-1 · 整体NOT_ACCEPTED

用户要求全产品严谨重新验收：每个交互/展示先明确产品合同，API/持久化与浏览器独立二次确认，授权独立测试Agent；自主持续推进，合格阶段才经PR合并main，覆盖旧逐Phase等待规则。所有改动在agent-lab，不提交无关历史修改或秘密。

当前子主题：L05 MCP进程范围与执行时禁用检查。架构专家确认内置工具缓存执行引用可绕过禁用，已在Registry调用边界实时检查当前工具/父服务；页面说明进程/所有组织/重载/重启范围，加入只读刷新及未确认回执自动读回。后端相关31测试、前端相关13测试，全API762/Web207测试、lint、三端type/build及独立源码/清单复核通过；21个Redis集成测试因未配置本地服务跳过。当前环境无Docker，提交后必须核对精确head远端隔离浏览器/恢复链；整体仍NOT_ACCEPTED。

最近已完成阶段PR40：MCP开关回执，main `ade07bf2139f628b49a87d7f0fbf4c892a15649a` 已核验。完整隔离API82/浏览器/恢复通过；整体不因此通过。详细当前事实见CURRENT_STATE。

下一产品子主题优先选择：L05进程内开关作用范围的产品文案与恢复合同，或L08以后数据/审计/录制/评测剩余运行状态双证据。先读对应实现/数据流/权限/成本，单主题推进；不得继续只累计测试数而忽略完整运行时覆盖台账。Interview黄金链仍待独立完整验收。

费用门：每次≤0.5CNY、发布前累计≤3CNY；未知账单未核，不运行付费推理、不重放历史失败。离线fixture不证明真实质量。

[完整历史](archive/reacceptance-2026-10-18/ACTIVE_TASK.md) · [验收矩阵](../acceptance/PRODUCT_REACCEPTANCE_PLAN.md) · [当前仪表](../acceptance/INTERNAL_PRE_RELEASE_STATUS.md)
