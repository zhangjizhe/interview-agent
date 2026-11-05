# 本机作品集网关（尚未完成真实接通验收）

这是独立部署附件，只开放公开助手的两个固定接口。管理、登录、数据库与完整 API 不对公网开放。网站浏览器不持有接入密钥；Sites 服务端 Secret 保存独立随机网关密钥。它不是管理员密码、SMTP 授权码、JWT 或回答票据密钥。

## 启动与边界

1. 先通过正常管理员登录、冻结审查评测和发布门禁发布专用 Agent，再按 `docs/runbook/PORTFOLIO_ASSISTANT.md` 配置原 API。不能将测试 fixture 的直接发布复制到真实环境。
2. 在当前机器创建独立随机网关密钥，保存在本机 Secret 管理器（macOS 为 Keychain）。设置非秘密的 `PORTFOLIO_GATEWAY_PUBLIC_ORIGIN` 为网站精确 HTTPS origin。
3. `docker compose -f deploy/portfolio-edge/compose.yml up -d --build gateway`。该 Compose 仅部署网关，不启动迁移、不重建原 API、不触碰数据卷。默认产品 Docker 网络名为 `interview-agent_default`，不同项目名需显式设置 `PORTFOLIO_BACKEND_NETWORK`。
4. 用 Secret 管理器经 stdin 管道传给 `python3 deploy/portfolio-edge/inject-secret.py`，或直接运行该程序，在隐藏输入中填写。密钥只进入容器 tmpfs，加载后删除；不出现在镜像、Docker 环境或命令参数里。重启容器后必须重新注入，未注入时不提供服务。
5. 网关只绑定 `127.0.0.1:8791`。本机验证通过后才能显式开启 `--profile temporary-public-test ... up -d tunnel`。临时 Cloudflare Quick Tunnel 的地址每次可能变化，进程停止即不可用；没有长期服务保证，不能当正式服务器验收。仅保留连接状态级别的日志；不得启用请求调试、访问日志或完整票据 URL 日志。
6. 在 Sites 生产服务端配置 `AGENT_LAB_BASE_URL=https://<公开网关主机>/api`、`AGENT_LAB_GATEWAY_KEY=<相同独立密钥>`，按 Sites 流程重新部署匹配源码。先检查匿名管理路径404、缺密钥401、错误来源403，再做有预算的真实问答与私有 Run/Trace/报告读回。配置存在不代表服务已就绪。

停用公网入口只停止本附件的 tunnel/gateway，保留原服务和数据卷；同时从 Sites 移除对应接入变量。不要运行 `down -v`。上线前仍须完整验收与对应 CI。

## 搬到闲置电脑

先确认操作系统、Docker 与持续联网条件；保留原主机可恢复状态。备份并验证 PostgreSQL、Redis（含准入幂等状态）和向量数据，不将数据卷或秘密放进 Git。按目标架构重建已验收源码镜像、恢复私有配置与数据，校验归属、发布版本、Run/Trace/报告后，再切换 Sites 的单一后端地址。目标电脑应保持供电、联网且不休眠。长期地址需另行配置固定域名和受管理的 TLS 入口；本附件的临时隧道不是长期部署方案。两个网卡环境或架构的实际迁移尚未验证。

## 验证

`node --test deploy/portfolio-edge/gateway.test.mjs` 是合成安全合同验证，不证明真实模型、发布或公网可用。镜像、HTTP 与公网验证须另记录实际结果。
