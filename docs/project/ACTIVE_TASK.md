# Active task

2026-11-16 当前唯一任务：个人网站经 Agent Lab 返回已校验的分段 SSE，详见 docs/project/PORTFOLIO_STREAMING.md。真实网页已在运行完成前两次显示内容，单次模型调用完成且有6条持久流检查点；估算0.000948CNY非账单。相关143项离线回归、类型/Lint/API及Docker构建通过；本机API已部署并保留旧容器及211条既有Run，首次启动参数错误回滚亦保留记录。不是逐Token输出；公网TLS及JSON-only外部网关仍未通过，GitHub最新CI/合并待核验。无数据库迁移、未改鉴权或已发布Prompt、未混入历史网站WIP。

2026-11-10 — LAB-DATA-GOVERNANCE 续验，用户在 PR #71 合并后要求继续。唯一主题：完成资料集合的类型、归属、READ/WRITE/所有者授权和 Agent 版本绑定的实际隔离验证。沿用暂停的本地候选，禁止混入网站/认证历史修改。

目标：同组织管理员之间也默认私有，跨组织拒绝；题目/文章/文档分开；Agent只消费显式绑定且当前仍有权限的集合。复用现有NestJS/Prisma/组织上下文/运行网关和Trace。数据库为新增表/复合外键与版本证据，不改原题库归属；CRUD无模型费用，合成运行验证不能代表RAG语义质量。

已核对：DataGovernanceService/Controller/DTO、Prisma迁移、tenant-policy、ConfiguredRuntime/Registry与前端候选。旧DB失败来自夹具返回懒PrismaPromise时退出ALS，修复为在scope内await；拒绝断言保留。下一步独立PG迁移/DB矩阵、真实HTTP鉴权/撤权、持久Trace与克隆回归，再检查UI、相关lint/type/build/diff及最新CI。

当前代码候选尚未交付/部署。原Lab5175仍PR #71镜像；原数据库/服务与卷保留，不触发启动Embedding。最终范围、部署与未核实边界必须逐项记录。资料提取、通用向量RAG、统一简历属于后续阶段。

阶段回执：主体445d572已推送、PR #72已创建；DB/HTTP42、API1283/47skip、Web385、运行时53、隔离浏览器和专用PG恢复通过。后补Builder选框尺寸（固定响应1100/390px预览通过），最终以最新源码CI为准。原部署未更新；完整自动Docker门仍由CI核验，不能将本机手动gate退出记通过。
