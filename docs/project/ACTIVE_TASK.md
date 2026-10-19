# 当前任务

更新：2026-10-19 · PRODUCT-REACCEPTANCE-1 · 整体NOT_ACCEPTED

用户要求全产品严谨重新验收：每个交互/展示先明确产品合同，API/持久化与浏览器独立二次确认，授权独立测试Agent；自主持续推进，合格阶段才经PR合并main，覆盖旧逐Phase等待规则。所有改动在agent-lab，不提交无关历史修改或秘密。

当前子主题：B0-EXTERNAL-INIT。startExternalRun已创建RUNNING后必需user.message持久化失败会抛错却留运行态；定向旧3红1绿复现。最小修复仅条件FAILED收尾并原错传播，数据库收尾再失败只记录脱敏事件，不承诺完全消除孤儿。新4/4+相关15/15、lint/type/build通过；真实PG/API与浏览器fixture已加入，首新镜像完整链exit0/API85/全部浏览器/严格PG与向量恢复、最终独立复核通过。待提交及新精确CI/PR；整体NOT_ACCEPTED，无付费调用。

2026-10-19 23:40远端同步核验：PR43最终head76e4274六项CI成功并合并1aeeec3；PR44精确a8fcb7d4dc3ae4e22e6080cd4c0e4945fa48a3e3六项CI成功并合并，远端main与agent-lab均为ce1813159c6e96ea9d0dab8bbebf07703a70b1cb，本地agent-lab已快进。此轮仅核对远端和同步，未本地重跑、未部署、未付费模型调用；采用新交接的B0及全自建规划剩余范围，整体NOT_ACCEPTED。

最近历史阶段PR40：MCP开关回执，main `ade07bf2139f628b49a87d7f0fbf4c892a15649a` 已核验。完整隔离API82/浏览器/恢复通过；整体不因此通过。详细当前事实见CURRENT_STATE。

下一产品子主题优先选择：L05进程内开关作用范围的产品文案与恢复合同，或L08以后数据/审计/录制/评测剩余运行状态双证据。先读对应实现/数据流/权限/成本，单主题推进；不得继续只累计测试数而忽略完整运行时覆盖台账。Interview黄金链仍待独立完整验收。

费用门：每次≤0.5CNY、发布前累计≤3CNY；未知账单未核，不运行付费推理、不重放历史失败。离线fixture不证明真实质量。

[完整历史](archive/reacceptance-2026-10-18/ACTIVE_TASK.md) · [验收矩阵](../acceptance/PRODUCT_REACCEPTANCE_PLAN.md) · [当前仪表](../acceptance/INTERNAL_PRE_RELEASE_STATUS.md)
