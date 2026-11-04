# 产品运行与恢复手册

更新：2026-10-08。默认路径为 React、NestJS、Prisma、PostgreSQL、Redis、Milvus 与 Qdrant。Python 替代实现是实验性 profile；[旧 Python 排查记录](project/archive/release-readiness-2026-10-08/runbook-python-historical.md) 仅供历史追溯，不作为当前部署步骤。

## 本机启动

复制 `.env.example` 到私有 `.env`，配置模型凭据、至少 32 字符随机 JWT_SECRET、数据库凭据和管理员名单。不要覆盖已有 `.env`，也不要把密钥打印到终端、报告或仓库。运行：

```bash
docker compose config --quiet
docker compose up -d --build api web agent-lab
docker compose ps
curl --fail http://127.0.0.1:3001/api/health/ready
```

Interview 为 localhost:5173，Lab 为 localhost:5175；API 3001。服务端口默认仅绑定 loopback，Qdrant 固定镜像摘要。默认数据库示例凭据仅用于本机；生产需独立强凭据、TLS 入口、网络 ACL 和平台 Secret 管理。未提供生产域名及目标环境时，本机验收不能记为生产上线。

API 和独立 migration job 共享镜像。升级前冻结写入并备份；migration 成功且就绪检查通过后才恢复流量。禁止 `db push`、修改已应用迁移、重置账本或删卷恢复服务。取消功能包含加性 `20261008010000_evaluation_cancellation` 迁移；旧 API 回滚前须验证新数据合同兼容。

## 邮箱验证码与账号恢复

`AUTH_EMAIL_OTP_SECRET` 应使用独立的 32 字节随机值；SMTP 主机、发件地址和凭据放在私有环境文件或部署 Secret 中，不提交真实值。`AUTH_EMAIL_SMTP_SECURE=false` 时客户端仍强制 STARTTLS（通常使用 587）；设为 `true` 时使用隐式 TLS（通常使用 465）。邮箱服务未配置或发送失败时，验证码流程失败关闭；登录不降级为仅密码。

新账号须先验证邮箱才能创建；每次密码登录都会要求新验证码。改密须提供当前密码和已验证邮箱验证码，成功后撤销所有会话；找回密码仅发往已验证邮箱，重置同样撤销会话。迁移后原有账号的 `emailVerifiedAt` 为空；仍记得当前密码的用户可通过“绑定旧账号邮箱”验证新邮箱。忘记当前密码且历史邮箱未验证的旧账号没有安全的自助恢复路径，应由部署者按独立的身份核验支持流程处理，不能发送验证码到用户任意输入的地址来接管账号。

`20261104000000_auth_email_verification` 在新增列前检查历史邮箱是否有忽略大小写后的重复值；发现重复会停止迁移且不自动改写账号。部署者应先备份并人工核对冲突账号，再按数据修复流程恢复部署。迁移还会建立 `lower(email)` 唯一索引，以阻止并发注册或邮箱认领创建大小写不同的重复身份。应用不应绕过 Prisma migration 直接改库。

新部署前执行私有备份和恢复演练，然后通过标准 migration job 执行迁移。不得清空 Redis `auth:*` 验证码、限流或会话状态。CI 的 TLS SMTP sink 仅在隔离内部 Docker 网络写合成邮件，不代表真实邮箱送达；真实验收须使用所有者控制的邮箱并确认 SMTP TLS、注册、重复登录、改密、找回和多设备撤销。真实邮件/模型费用按各自账单单独核对。

## 管理员权限

由部署所有者按 [管理员权限 SOP](ADMIN-ACCESS-SOP.md) 查询、授权、撤权与吊销旧会话。数据库角色和 ADMIN_USER_IDS 名单含义不同，不用名单删除替代撤权。

## 健康、故障与监控

`GET /api/health` 只表示进程存活。`GET /api/health/ready` 检查 PostgreSQL、Redis 和镜像携带的全部迁移；每次依赖检查限时 3 秒，失败返回脱敏 503。它不证明模型、Milvus 或 Qdrant 可用，向量服务另查容器健康及业务合成读写。

Redis 故障时受保护请求应失败关闭。Redis `auth:*` 是吊销安全状态：持久化、noeviction 与受限管理权限不可省略。禁止 FLUSHALL/FLUSHDB；状态丢失时轮换 JWT 密钥并要求重新登录，不能将安全状态当可随意重建的缓存。API 恢复后验证另一设备会话保留、退出 access/refresh 拒绝和 readiness。

题库 `QUESTION_WRITE_ROLLED_BACK` 表示已确认补偿；`QUESTION_WRITE_UNCONFIRMED` 表示必须核对存储后再重试。插入和 embedding 不自动重放，只有幂等 flush 的限流可在总时限内重试。Milvus 无跨服务事务；Provider 已产生费用不会因补偿退回。

LLM 故障先检查脱敏错误类别、模型配置、Provider 状态与正规额度。不能通过清账本、提高重试次数或伪造费用为零恢复。调用和 fallback 都可能消耗额度；运行中取消只阻止后续样本，不能撤销在途请求。计费未知保持未知。

运行 `node scripts/setup-observability.mjs` 后，显式启用 `docker compose --profile observability up -d prometheus grafana`。凭据保存在忽略目录，生产改用 Secret。Prometheus localhost:9090、Grafana localhost:3000，均非公开入口。`node scripts/verify-observability.mjs` 检查专用 metrics token、抓取目标与 dashboard；用户 JWT 不可替代 metrics token。

指标描述真实文本模型 HTTP 尝试及已报告 usage，包含启动探测；缓存 hit 不计模型调用，embedding 费用不在这些指标内。持续时间不是首 token 延迟。重启进程累计计数归零，Prometheus 保留 7 天；多副本须逐实例抓取。

## 数据保护与恢复

业务升级先使用 `scripts/db/snapshot.sh` 创建私有 PostgreSQL 备份，`scripts/db/verify-restore.sh` 恢复到隔离库并核对 schema/全表行数；文件须私有权限并排除 Git 与 Docker 构建上下文。首次 baseline 只在冻结写入、恢复已验证且 schema 指纹匹配后使用 `mark-baseline-applied.sh` 的双确认配置。迁移失败停止流量，保留快照，不忽略错误。

Milvus 本机 local-storage 模式必须成对备份 `/var/lib/milvus` 与 etcd `/etcd`：先停止应用写入及 Milvus，再停止 etcd，复制一致快照。Qdrant 停写后备份 storage 或经验证的 snapshot。记录镜像摘要、备份时间、租户集合清单；先在同版本独立环境恢复元数据和数据，检查向量、payload、题库原文以及租户边界，再规划生产恢复。禁止只恢复 Milvus 文件而遗漏 etcd。

`bash scripts/ci/verify-built-api.sh <API镜像>` 使用无外网临时网络和显式合成数据，验证实际 HTTP、认证、训练、Milvus 写入/补偿，随后演练 PostgreSQL 完整逻辑恢复与新容器中的 Milvus/etcd/Qdrant 恢复。它不读取业务 `.env`，结束时删除自己的容器、匿名卷和临时快照。隔离演练结果不能代替生产备份、异地灾备或 RPO/RTO。

答案缓存 revision、旧集合保留与准确 ID 清理见 [CACHE-LIFECYCLE.md](CACHE-LIFECYCLE.md)。生产真实费用、容量和学习效果须另有实际证据；不以离线 fixture 或 25 次 readiness 请求作商业效果承诺。
