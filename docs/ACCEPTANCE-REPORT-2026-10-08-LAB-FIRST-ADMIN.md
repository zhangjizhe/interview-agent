# Lab 新组织管理员首次进入修复

日期：2026-10-08 · LAB-FIRST-ADMIN-1

## 故障与原因

用户先遇到代理 502（此前 LAB-AUTH-PROXY-1 已修复），之后登录成功但控制台持续连接，最终显示 Resource not found 并建议重新登录。此次后端错误为 GET /api/agent-lab/dashboard 的 404，与密码或 ADMIN 角色无关。

ensureGoldenDataset 在当前组织 upsert Golden Dataset；LabDataset.version 却保留全局唯一索引。另一个组织已有同版本记录时，租户过滤使该 upsert 无法更新，插入又发生冲突，Prisma 返回的失败被租户 middleware 转为 404。前端错误页只有重新登录按钮，使业务初始化问题看起来像会话问题。

## 为什么原测试未发现

AgentLabService 单元测试 mock ensureGoldenDataset。浏览器验收 admin-mcp-acceptance.mjs 使用固定 admin-acceptance，未覆盖不同组织新管理员首次进入。旧镜像 HTTP smoke 验证 /agent-lab/agents，没有访问 dashboard。它们的通过证明已执行场景通过，不能证明新组织管理员的全链路通过；此前 readiness 200/登录空请求 400 也只能证明可达性。

## 修改及边界

- LabDataset 使用 organizationId/version 复合唯一；服务使用当前可信 tenant context 构造 upsert。版本对外仍为原值，组织内去重，跨组织同版本有独立 ID。
- 新 migration 20261008020000_lab_dataset_tenant_version 先创建复合索引再移除全局索引，保留所有行、ID 与已有关系；未修改历史 migration。
- 控制面错误页增加重试连接，保留重新登录的自助入口。没有修改密码、角色、组织归属、其他设备会话或扩大跨组织权限。
- 新组织不读取旧组织运行记录；不能为了显示旧记录迁移用户或绕过隔离。
- 本机停止 API 写入后保存私有 pg_dump 并校验归档目录可读取，独立 migration job 成功应用 18/18，再启动新 API/Lab 镜像。私有备份不提交 Git。
- 产生跨组织同版本数据后，不能直接恢复全局唯一索引或回滚到旧 upsert；回滚需单独核对兼容性与备份，不删除组织记录解决冲突。

## 实际验证

- 专用 PostgreSQL 新库及存量迁移：19/19；新增两个组织 dashboard 真实初始化、并发幂等、原组织数据不变、跨组织不可见、同组织重复版本拒绝。
- Lab 服务：15/15；认证 transport：10/10。相关 API/Lab 严格 lint、API typecheck、Lab tsc/Vite build、实际 API/Nest 与 Lab 镜像构建通过。
- 实际新镜像无外网隔离 smoke：36/36，增加普通用户 dashboard 403、fixture 授权后重新登录 ADMIN、另一组织并发 dashboard 200、独立同版本 ID、初始 MCP/导入列表 200，以及撤权后旧会话 403。
- 同一隔离脚本完成 Redis 故障/恢复、完整规范化 PostgreSQL 转储相等及 Milvus/etcd/Qdrant 真实读回；不作为生产 RPO/RTO 或容量证明。
- 本机独立 migration 成功；Lab readiness HTTP 200。用户当前浏览器保留会话，刷新后实际显示控制中心、数据集 VALID 和全部侧栏导航，未要求重新登录。

## 未完成与后续

本次验证范围为管理员身份进入控制面、初始化及既有合成 smoke；未完成所有产品功能的逐条用户验收，未运行真实模型 Benchmark 或产生新模型推理费用。未来浏览器 CI 应补入独立组织首次注册/授权及 API 重建后的代理恢复；当前新增真实数据库与实际镜像 HTTP 回归已进入 CI 脚本。管理员授权持久审计与权限页面仍为后续独立任务。
