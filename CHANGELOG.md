# Changelog

按 Keep a Changelog 分类，后续发布采用 Semantic Versioning。仓库当前 package 版本为 0.1.0；未核验到 v1.0.0 标签，因此不倒填发布日期。

## [Unreleased]

### Added

- 新增统一测试基线、按优先级整理的 Roadmap 与审查落实记录。
- 增加 Langfuse 出口脱敏回归测试。

### Changed

- README 首屏说明 AI 面试业务与 AgentLab 的编排、检索、网关、评测入口。
- 将完整 AgentLab 迁移契约移到独立文档，保留原接口与已知限制。
- 历史验收结果与当前验证分开描述；简历材料按 NestJS 默认路径重写。
- Docker 启动脚本直接使用镜像内构建；新截图默认忽略，现有证据保留。

### Fixed

- 修正快速开始遗漏 JWT_SECRET 的问题。
- 恢复无需 DI 的 ResumeParser/PDF 清洗测试；将知识题库测试从 Vitest 导入改为 Jest 默认环境并恢复执行。

### Security

- Langfuse metadata、input、output、工具错误和流式输出更新增加递归脱敏，保留 token 计数。
- 此修复不代表全面 PII 合规，也不自动清理已上传的历史记录。

### Known Limitations

- 6 份历史 spec 仍被排除，详见 docs/TESTING.md。
- 会话撤销/轮换、OAuth/MFA、请求级退避、SSE offset 恢复、Qdrant 启动策略和多租户容量仍待完善。
- Mem0 与其他第三方数据流需要隐私评估；自由文本 PII 和其他日志出口仍需审计。
- 缓存收益尚无普遍结论，保留历史 0% 命中与后续总 Token 增长的证据。
- 尚未发布 v1.0.0、在线 Demo 或合并默认分支。完整限制见 docs/ROADMAP.md。
