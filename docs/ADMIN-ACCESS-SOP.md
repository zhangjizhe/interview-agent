# 本机 Agent Lab 权限管理 SOP

更新：2026-10-08。适用于当前 Docker Compose / NestJS 产品路径。操作负责人为部署所有者；AI 仅在所有者明确指定账号、环境与目标权限后执行写操作。本文不授予任何人权限，不包含真实账号或凭据。

## 权限归属与边界

- Lab 后端要求数据库 `users.role = ADMIN`。JWT Guard 每次请求读取数据库当前角色；修改浏览器 localStorage 或旧 JWT 的 role 不能绕过后端检查。
- `ADMIN_USER_IDS` 是部署私有配置：注册时匹配名单会创建 ADMIN；组织创建、套餐配置/分配及成员转移还同时要求 ADMIN 和名单匹配。名单变更不自动更新已有用户角色。仅从名单移除不能撤销 Lab 权限。
- Docker、数据库、私有 `.env` 和 JWT 密钥的访问权属于最终控制权。限制主机登录、Docker socket 和数据库凭据，仅由所有者保管；任何持有这些访问权的人技术上都可改角色。当前无独立授权审计表、双人审批或管理员授权页面。
- 本 SOP 的手工角色操作不修改组织、不绕过租户隔离、不赋予跨组织管理名单权限。生产环境另需正式审计与访问治理。

## 操作前确认

在仓库根目录运行。先确认连接的是本机目标部署，执行 `docker compose ps` 和 API readiness 检查。所有者记录目标账号、目标角色、原因、操作者和时间到私有运维记录；不要提交个人数据、密码或令牌到 Git。查询与变更均使用下面同一命令，通过交互输入避免将账号写进脚本。

## 查询、授权与撤权

执行下面整段命令。动作输入 `inspect` 查询、`grant` 授予 ADMIN、`revoke` 撤为 USER。写操作必须再次输入准确的 `动作:用户名`。不存在的账号不创建；并发角色变化时拒绝覆盖。成功后只输出角色，不输出凭据。

```bash
read 'LAB_ACCOUNT?目标用户名: '
read 'LAB_ACTION?动作 inspect / grant / revoke: '
LAB_CONFIRM=''
if [ "$LAB_ACTION" = grant ] || [ "$LAB_ACTION" = revoke ]; then
  read 'LAB_CONFIRM?确认输入 动作:用户名: '
fi
docker compose exec -T   -e LAB_ACCOUNT="$LAB_ACCOUNT" -e LAB_ACTION="$LAB_ACTION" -e LAB_CONFIRM="$LAB_CONFIRM"   api node <<'NODE'
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const id = process.env.LAB_ACCOUNT;
  const action = process.env.LAB_ACTION;
  if (!/^[a-z0-9][a-z0-9_-]{2,31}$/.test(id || '')) throw new Error('Invalid account');
  if (!['inspect', 'grant', 'revoke'].includes(action)) throw new Error('Invalid action');
  const user = await p.user.findUnique({ where: { id }, select: { role: true } });
  if (!user) throw new Error('Account not found; no change');
  if (action === 'inspect') { console.log({ role: user.role }); return; }
  if (process.env.LAB_CONFIRM !== `${action}:${id}`) throw new Error('Confirmation mismatch; no change');
  const role = action === 'grant' ? 'ADMIN' : 'USER';
  const result = await p.user.updateMany({ where: { id, role: user.role }, data: { role } });
  if (result.count !== 1) throw new Error('Concurrent change; inspect before retry');
  const verified = await p.user.findUnique({ where: { id }, select: { role: true } });
  if (verified?.role !== role) throw new Error('Verification failed; inspect before retry');
  console.log({ previousRole: user.role, verifiedRole: verified.role });
})().catch(() => { console.error('Operation failed; inspect current role before retry.'); process.exitCode = 1; })
  .finally(() => p.$disconnect());
NODE
unset LAB_CONFIRM LAB_ACTION
```

以上交互语法用于项目本机 zsh。数据库角色写入与后面的 Redis 吊销是两个独立步骤，不宣称跨存储事务；如后一步失败，角色变更仍可能已生效，须查询并记录，不能记整套操作完成。

## 吊销该账号全部旧会话（可选）

授权或撤权后可要求重新登录；怀疑旧会话泄漏时执行。此操作对应现有 AuthSessionService.revokeUser 的版本递增，不删除业务数据；不会禁用账号或阻止其使用正确密码重新登录。保留上一步的 LAB_ACCOUNT，核对后执行：

```bash
read 'LAB_REVOKE_CONFIRM?确认吊销全部旧会话，输入用户名: '
if [ -n "$LAB_ACCOUNT" ] && [ "$LAB_REVOKE_CONFIRM" = "$LAB_ACCOUNT" ]; then
  docker compose exec -T redis redis-cli INCR "auth:version:$LAB_ACCOUNT"
else
  echo '未确认，未执行吊销'
fi
unset LAB_REVOKE_CONFIRM LAB_ACCOUNT
```

当前本机 Redis 配置无需 redis-cli 密码。不同环境须用部署方安全认证方式，不把密码放到命令行。禁止 FLUSHALL、FLUSHDB 或删除 auth:*；会话版本不可回退。Redis 失败时保留数据库角色结果，修复认证存储后再吊销和验证。

## 验收与回滚

1. 重新执行 inspect，核对目标角色。授权后用户在 Lab 重新登录，验证控制台正常加载；前端会话角色需通过重新登录刷新。
2. 撤权后验证后续 Lab 管理 API 返回 403；如另做会话吊销，旧会话应返回 401，新登录仍为 USER。已进入执行阶段的请求不会因后续撤权被自动取消，运行中任务需通过其受控取消机制另行处理。
3. 验证普通 Interview 账号仍可登录，其他账号角色不变。记录数据库读回、HTTP 验收与失败情况，不保存 token 或密码。
4. 角色回滚为原值属于新的权限变更，需所有者再次明确授权；使用相反动作并重新验收。会话吊销不可恢复旧 token，须重新登录。

## 私有名单维护

仅需要组织/套餐管理或后续注册引导时，由所有者编辑私有 `.env` 的 `ADMIN_USER_IDS`，保留原有合法名单。按常规部署流程重建 API 配置并检查 readiness；API 重建会中断在途工作，应先停止新任务并核对运行状态。名单不得包含无需权限的普通账号。撤权时同时检查名单，避免将来同名重新注册被自动授权。不要打印或提交 `.env`。

## 本次文档验证

已依据 AuthService、JwtAuthGuard、RolesGuard、OrganizationsService 和 AuthSessionService 核对行为；角色脚本语法检查通过。既有本机单账号授权已读回 ADMIN；本 SOP 未对业务账号执行新的授权、撤权或会话吊销，完整操作演练及生产权限治理仍待单独验收。无 API、数据库 schema、运行时或 AI 成本变更，AI Benchmark 不适用。
