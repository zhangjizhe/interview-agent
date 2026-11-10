# Active task

2026-11-10 — LAB-DATA-GOVERNANCE 续验，用户在 PR #71 合并后要求继续。唯一主题：完成资料集合的类型、归属、READ/WRITE/所有者授权和 Agent 版本绑定的实际隔离验证。沿用暂停的本地候选，禁止混入网站/认证历史修改。

目标：同组织管理员之间也默认私有，跨组织拒绝；题目/文章/文档分开；Agent只消费显式绑定且当前仍有权限的集合。复用现有NestJS/Prisma/组织上下文/运行网关和Trace。数据库为新增表/复合外键与版本证据，不改原题库归属；CRUD无模型费用，合成运行验证不能代表RAG语义质量。

已核对：DataGovernanceService/Controller/DTO、Prisma迁移、tenant-policy、ConfiguredRuntime/Registry与前端候选。旧DB失败来自夹具返回懒PrismaPromise时退出ALS，修复为在scope内await；拒绝断言保留。下一步独立PG迁移/DB矩阵、真实HTTP鉴权/撤权、持久Trace与克隆回归，再检查UI、相关lint/type/build/diff及最新CI。

当前代码候选尚未交付/部署。原Lab5175仍PR #71镜像；原数据库/服务与卷保留，不触发启动Embedding。最终范围、部署与未核实边界必须逐项记录。资料提取、通用向量RAG、统一简历属于后续阶段。
