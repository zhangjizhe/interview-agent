# 审查意见落实记录

日期：2026-09-28。输入为用户提供的项目优化任务书；按现有仓库核验建议，没有将其中的“发布、删分支、部署”示例自动当作执行指令。

## 已完成

- 重写 README 首屏，给出业务闭环、四个工程支点及真实代码入口；保留架构图、基准、业务流程和历史验收证据。
- 把完整 AgentLab 能力与升级边界移入 `docs/agent-lab-status.md`，降低首屏阅读成本。
- 修正 Docker 首次启动遗漏 JWT_SECRET 的错误；`docker:up` 直接在镜像中构建，避免本机构建前未生成 Prisma Client。
- 新增 `docs/TESTING.md`，统一 README、WIKI 和简历材料口径；撤下跨分支 336、无证据可用性和成本承诺。
- 新增 `docs/ROADMAP.md` 和 `CHANGELOG.md`；没有倒填 v1.0.0 的发布日期。
- 恢复 PDF / 简历清洗 29 项测试、知识题库 8 项测试；新增 Langfuse 脱敏 4 项测试。
- 对 Langfuse metadata、输入输出、工具错误与流式输出更新递归脱敏；测试验证 SDK 出口，不只测试独立函数。
- 忽略本地 pnpm 缓存和新生成截图。现有 47 张 PNG 及其引用保留，未删除本地文件、取消跟踪或重写历史。

## 验证结果

后端 Jest **302 passed（35 suites）**，node:test **22 passed**，前端 Vitest **63 passed（8 files）**；前后端类型检查与生产构建通过。详细环境、命令与限制见 TESTING.md。测试不调用真实模型、不证明线上效果或隐私合规。

## 任务书与当前仓库的差异

1. 已有 React Testing Library、Vitest、组件/状态/流式 hook/页面测试，“前端完全无测试”不成立。
2. 初始默认 Jest 排除了 7 份 spec 加 1 份题库 test；恢复两份后仍排除 6 份，不能仅看 runner 的 skipped=0。
3. `.env.example` 的 JWT_SECRET 为空，Compose 要求非空；“只填 QWEN_API_KEY”不足以启动。
4. 语义缓存历史 0% 来自未触发白名单节点，prompt cache 才记录为 Provider 参数限制；两者不能混淆。
5. 本地 main 相对 agent-lab 落后 14 个提交、无独有提交（未 fetch，不代表实时远端状态）。当前改动保留在 agent-lab 工作区。
6. 仓库 package 版本为 0.1.0，本地未见 v1.0.0 标签；Agent 注册的 v1.0.0 不等同于仓库 Release。

## GitHub 门面草稿

Description：AI 面试 Agent 平台：LangGraph 多节点编排、Milvus/BM25 混合检索与 AgentLab 版本化评测，采用 NestJS / React / TypeScript。

Topics：`ai-agent`、`langgraph`、`llm`、`rag`、`multi-agent`、`nestjs`、`react`、`typescript`、`milvus`、`hybrid-search`。分别覆盖 Agent、图编排、模型应用、检索、多智能体、后端、前端、语言、向量库和检索方式，不承诺搜索排名。

Website 暂留空，待有真实 Demo 再填写。先做经过验证的 Release；当前尚无适合独立分发的稳定 npm 包。

## 剩余事项

- 6 份历史 spec、请求级退避、SSE 恢复等真实工程工作见 TESTING.md / ROADMAP.md；本轮没有声称全部解决。
- 现有 CI 有独立 job 缺安装步骤、历史固定测试数等问题；本轮未改流水线或声称远端 CI 通过。
- 合并 main、推送、修改 About、创建 tag/Release、删分支、在线部署和公开文章尚未执行。发布前需重新同步远端、检查冲突、运行 CI 和迁移验收。
- 截图先保留已有证据。若要取消跟踪 E2E 截图，需先将被 README/验收文档引用的图迁移到 docs/assets，修正所有引用，再执行保留本地文件的取消跟踪；无需为 24MB 仓库贸然重写历史。
- 演示建议录制候选人“登录 → 上传示例简历 → 确认 → 流式问答 → 报告”和 `/lab` 的 Run / Trace / Evaluation。录制与静态 Demo 均尚未制作，不能填入不存在的链接。
