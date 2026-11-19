# Active task

2026-11-17 — 唯一主题：Agent Lab 控制台框架与 Trace 排障体验。

用户自行处理腾讯云 zhezone.cn 域名与 Cloudflare DNS，明确要求继续项目交互与审美改进。本阶段限定 Agent Lab 导航、页面工具栏、错误/加载状态、响应式框架及 Trace 信息层级；复用 React/TanStack Query/lucide，不改 API、数据库、鉴权、模型或资料权限，不重放付费问答。不将本阶段称为全产品/UI整体完成。

源码基线 agent-lab 7405555946f2f68c921915a8fee03184e702f04b。已核 main.tsx 的12项平铺导航、全局MCP操作、三接口共同阻塞框架，以及 RuntimeTraceWorkspace/RunInspector/trace样式。当前两张受控5175标签实际均仍显示登录页；用户说已登录，暂未取得可见正常会话，不读取其他浏览器凭据、不绕过鉴权。独立界面回归可用明确标记的隔离fixture，但不称真实业务验收。

方案：统一克制的浅色框架，分组导航、窄屏可展开导航、页标题/说明/上下文操作；独立页面不再依赖无关汇总读取；Trace改善状态/选中/空与失败层级。导航、未保存处理锁、真实错误、键盘及窄屏需回归。先读实现后小范围修改；相关 lint/type/build、交互回归、diff 后仅提交本主题，历史分身/认证/网站/迁移WIP保留。既有PR73安全审计失败仍阻塞合并/公网发布。

域名迁移准备保存在 archive/mac-migration-preparation-2026-11-17.md 和 docs/runbook/MAC_THREE_SITES.md；用户现已表示腾讯云购买并提供Cloudflare分配的NS，未核DNS实际生效/目标Mac部署。不要把此前“未购买”摘要当最新用户状态。分身真实测试费用待核对和引用修复最后实时复验未完成继续保留。

本阶段实际结果：47项相关测试、最终17项受影响复验、Lab/Web类型、Lint、Lab及Docker构建通过；最终桌面/390px隔离fixture浏览器复验通过。前端镜像workspace-ux-check已只更新本机5175并保留rollback-ux-nov17，HTML200/未登录API401通过，未改后端/卷/秘密。详细证据及未完成边界见LAB_WORKSPACE_UX.md。GitHub既有Product verification仍失败，本阶段未提交推送/合并；真实正常登录后的数据/Trace验收尚未完成。阶段结束后等待用户继续，下一主题优先安全CI与真实验收，之后再处理题库导入/资料编辑，不声称全产品完成。
