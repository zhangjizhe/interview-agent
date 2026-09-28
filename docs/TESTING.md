# 测试基线与统计口径

本次核对：2026-09-28，基于本地 `agent-lab` 的 `c4868aa` 加本轮未提交改动，Node v24.11.1。以下只计算实际执行结果；不把测试文件数当用例数，不把用例数当覆盖率。

| 验证 | 本次结果 | 范围 |
| --- | --- | --- |
| API Jest | 35 suites / 302 passed，0 failed | 默认配置选中的后端单测，含恢复的 PDF 与题库测试、新增脱敏测试 |
| API node:test | 22 passed，0 failed | `apps/api/tests/cache.spec.ts`，缓存分类、键与 JSON 容错工具 |
| Web Vitest | 8 files / 63 passed，0 failed | 组件、状态、流式 hook、AgentLab 页面 |
| API / Web TypeScript | 均通过 | `tsc --noEmit` |
| API Nest build / Web Vite build | 均通过 | 本地生产构建 |
| Docker / 数据库迁移 / 浏览器 / 真实 Provider / Python | 本轮未执行 | 不把 2026-08-12 验收算成本轮结果 |
| 覆盖率 | 本轮未生成 | 不声明百分比 |

Jest 基线从 261 增至 302：恢复 PDF 测试 29 项、题库测试 8 项，新增脱敏测试 4 项。当前 0 failed 仅描述被选中的测试，**仍有 6 份历史 spec 在配置中被排除**。

## 复跑

常规工作区命令：

```bash
pnpm --filter @interview-agent/api test
pnpm --filter @interview-agent/web test
pnpm typecheck
pnpm build
```

本机 pnpm 启动时尝试重新安装依赖，因非交互环境拒绝清理 node_modules；本轮未重装，而是使用已安装的本地工具直接执行：

```bash
(cd apps/api && ./node_modules/.bin/jest --runInBand)
(cd apps/api && ./node_modules/.bin/tsx --test tests/cache.spec.ts)
(cd apps/web && ./node_modules/.bin/vitest run)
(cd apps/api && ./node_modules/.bin/tsc --noEmit)
(cd apps/web && ./node_modules/.bin/tsc --noEmit)
(cd apps/api && ./node_modules/.bin/nest build)
(cd apps/web && ./node_modules/.bin/vite build)
```

## 未执行的历史 spec

位置均在 `apps/api/src/__tests__/`，由 `apps/api/jest.config.js` 显式排除。以下原因来自源码核对，不伪称本轮逐个执行成功。

| 文件 | 当前问题 / 下一步 |
| --- | --- |
| llm-gateway.fallback.spec.ts | 引用不存在的 CacheService 等旧依赖，部分断言只检查方法存在。按真实 Provider 故障、熔断与切换行为重写 |
| memory.dual-write.spec.ts | 旧 DI mock 与 RedisShortTermMemory / MilvusLongTermMemory / Mem0CloudMemory 构造契约不匹配；补双写单边失败与双边失败断言 |
| interview.sse.spec.ts | 导入完整 AppModule / supertest，但主要只解析硬编码事件；需要带鉴权、真实 HTTP 和故障分支的独立集成测试环境 |
| dynamic-task-queue.followup.spec.ts | 提供旧 QuestionModel token，实际依赖 QuestionBankService 等；对齐题库与任务持久化契约 |
| context-manager.watermark.spec.ts | 旧 ContextManagerService、阈值与返回字段不匹配；现有 context-manager.waterline-boundaries.spec.ts 已覆盖真实边界，迁移前对比遗漏场景 |
| golden-dataset.eval.spec.ts | Vitest 及失效的 eval-runner / eval-reporter 相对导入，还依赖真实模型和基础设施；单独建立可配置评测命令与预算，不混入离线单测 |

已恢复的 `resume-parser.spec.ts` 不需要 Nest DI；`knowledge-banks/index.test.ts` 已改用 Jest。没有删除业务断言以换取通过，也没有把排除项包装成“全量零跳过”。

## 历史结果

- WIKI 的 105（Jest 83 + node:test 22）是 2026-06 快照。
- 原简历稿的 336 混合 Python / api-legacy / Web 分支，不能作为当前主线路径总数。
- README 的 214 Jest、59 Vitest、9/9 浏览器、10/10 内容工作流保留为 2026-08-12 历史验收；见 ACCEPTANCE-REPORT-2026-08-12.md。
- 缓存 0% 与后续 46 次命中不是同一压测；不得合并为统一收益指标。

仍有 ts-jest 配置弃用与 React Router 升级提示，不影响本次执行结果；后续依赖升级时处理。CI、Python 和真实外部服务需各自验证，不能用本地单测结果代替。
