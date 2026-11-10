# Tasks

2026-11-09 — PLATFORM-RESTORATION / Phase 1 TRACE-DIAGNOSTICS。基线 `4e33101` / PR #70。用户要求 Trace 排障交互、题库分权、简历与 URL/文件 RAG 恢复。按阶段进行，详细源码核对、依赖与验收门见 `docs/project/PLATFORM_CAPABILITY_RESTORATION.md`。

源码候选：真实 Run 列表 + 共享只读 RunInspector，统一 Trace 主页面、编排和报告入口。保留工作区 ADMIN API、精确 Run/版本核对、错误/未知费用与拒绝状态；输入/输出显式展开，常见凭据/邮箱/system Prompt 字段过滤。无 API/schema/权限/模型/发布变更。资料恢复并未因 Trace UI 完成而完成。

本轮实际验证（2026-11-10 续验）：完整 Web 359 项通过；最后的过滤/布局/截断标记补丁有 19 项定向回归通过。Lab 类型/构建、Web 类型与相关 lint 通过。隔离干净源码构建的 Trace 前端已替换本机 Lab，保留回滚镜像、端口与挂载；API/数据库未重启，无迁移。正常登录浏览器已读取真实历史网站 Run，筛选运行与模型事件、查看 qwen-plus / 911 输入 Token / 99 输出 Token / 历史估算 0.0009268CNY，并展开事件输出；四条有序事件。浏览器早期标签失效与旧资源问题已解决；真实页面发现 promptTokens 误过滤后修复并二次验证。仅查看历史记录，无新外部模型调用；历史未知费用仍未知。

精确新源码的 CI/PR/远端核对待完成，旧 PR #70 的绿灯不能认证新代码。全产品仍 NOT_ACCEPTED。源码检查点会早于最终 CI；最终回执需在 PR 和本地持久交接中核对。

- 当前：Trace 排障 Phase 1 的真实浏览器、CI 和发布收尾。
- 下一阶段：资料导航/简历入口与 typed collection ACL 恢复；先处理治理 DB 失败夹具，不移除拒绝断言。
- 后续：通用 URL/文件提取、分块/索引/检索证据。现有题库导入不能当作文章 RAG。
- 独立待办：实验 Python CI 浏览器安装环境兼容、稳定入口、旧 Mac 迁移、广泛语义质量和整体验收。
