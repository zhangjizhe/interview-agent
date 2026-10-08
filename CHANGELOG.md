# Changelog

按 Keep a Changelog 分类，后续发布采用 Semantic Versioning。仓库当前 package 版本为 0.1.0；未核验到 v1.0.0 标签，因此不倒填发布日期。

## [Unreleased]

### Added

- 评测任务支持排队取消和样本边界取消，保留费用及租约；增加真实训练 HTTP/数据库、向量写入和缓存维护验收。
- 答案缓存支持部署 revision；停用旧集合提供默认预览、快照与准确 ID 计划校验的维护工具。

- 新增统一测试基线、按优先级整理的 Roadmap 与审查落实记录。
- 增加 Langfuse 出口脱敏回归测试。

### Changed

- README 首屏说明 AI 面试业务与 AgentLab 的编排、检索、网关、评测入口。
- 将完整 AgentLab 迁移契约移到独立文档，保留原接口与已知限制。
- 历史验收结果与当前验证分开描述；简历材料按 NestJS 默认路径重写。
- Docker 启动脚本直接使用镜像内构建；新截图默认忽略，现有证据保留。

### Fixed

- 两端退出执行服务端会话吊销；修复训练证据遗漏 skillId、并发重复完成及复测关联。
- 恢复五份历史合同测试并移除全部历史路径排除；压缩决策缓存按完整内容、role 和 tier 隔离。

- 修正快速开始遗漏 JWT_SECRET 的问题。
- 恢复无需 DI 的 ResumeParser/PDF 清洗测试；将知识题库测试从 Vitest 导入改为 Jest 默认环境并恢复执行。

### Security

- 升级 NestJS 11、React Router 7 与兼容传递依赖；braces AST 深度、循环与大小防护加入固定 SHA 补丁及 SDK 回归。官方 advisory 仍为 1 high，无零漏洞声明。

- Langfuse metadata、input、output、工具错误和流式输出更新增加递归脱敏，保留 token 计数。
- 此修复不代表全面 PII 合规，也不自动清理已上传的历史记录。

### Known Limitations

- 专用 PostgreSQL 测试与默认离线 Jest 分开运行；真实质量、生产容量、OAuth/MFA、SSE offset 恢复与第三方隐私评估仍待验收。
- Mem0 与其他第三方数据流需要隐私评估；自由文本 PII 和其他日志出口仍需审计。
- 缓存收益尚无普遍结论，保留历史 0% 命中与后续总 Token 增长的证据。
- 尚未发布 v1.0.0、在线 Demo 或合并默认分支。完整限制见 docs/ROADMAP.md。
