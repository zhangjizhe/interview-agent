# Lab 控制中心与导航的逐项证据

2026-10-09；PRODUCT-REACCEPTANCE-1；UI源码基线ea4f68f，应用代码未变。状态为部分证据，整体NOT_ACCEPTED。复用现有合成隔离Docker API/PG及真实Chromium；无外网Provider、无业务账号写入、外部付费0。浏览器使用真实dashboard/MCP响应，不替换展示数据。

| 库存模板 | 本轮明确验证 | 未覆盖边界 |
| --- | --- | --- |
| UI-0445/UI-0446/UI-0455 | 11导航实例逐一点击；唯一is-active、对应名称、enabled和一级标题 | 键盘、响应式、禁用/未配置分支、错误态 |
| UI-0463 | dataset版本、Case和回答数量与实际dashboard一致 | 完整说明、长值/错误/响应式；当前子串断言并非全文 |
| UI-0465/UI-0466 | 查看编排及治理MCP快捷入口到正确一级标题 | 键盘和响应式 |
| UI-0470 | 服务启用且绑定就绪数量/总数与MCP实际响应一致 | 故障及数量变化状态 |
| UI-0478 | 最近决定strong与dashboard一致，包括无记录回退 | 日期及描述UI-0479另待验 |
| UI-0483/UI-0487/UI-0491 | 数据集状态、失败运行数、质量门百分比与实际dashboard逐字段一致 | 非当前值、日期UI-0484、失败/加载状态 |
| UI-0659/UI-0667 | 思维链不可见和静态示意边界文案可见 | 全画布各节点、隐私说明UI-0668、不同视口 |

后端第二来源核对：AgentLabService.dashboard从当前组织Golden Dataset及最近20条LabRun/决定读取，失败数按HIGH/CRITICAL分类，质量门来自RELEASE_THRESHOLDS；AdminMcpController.list按enabled && executable统计。浏览器新增断言复核由独立测试Agent完成，覆盖范围与源码字段一致；没有据字段对照证明真实模型质量。

执行证据：`apps/web/e2e/lab-isolated-acceptance.mjs`的overview/导航断言；`scripts/ci/verify-built-api.sh`本机完整隔离执行退出0，HTTP80/80、浏览器新增断言/既有编排题库发布拒绝及严格PG/向量恢复通过。首轮HTTP80/80后因默认Chromium路径缺失而在浏览器启动前失败；显式复用本机已安装浏览器路径重跑通过，首轮不计通过。CI尚待本轮测试提交后最新对应构建核验。

全部条目保留NOT_ACCEPTED，PARTIAL仅表示上述限定状态证据；包装元素不因其子节点断言而自动通过。后续补齐加载/故障重试、MCP重载、键盘与响应式后才决定各项最终结论。
