# 本机个人网站发布（zhezone.cn）

这是独立部署附件，只构建并发布公开个人网站。它不重建、不重启 Interview、Agent Lab 或 API，也不写入或注入作品集网关密钥。公网入口沿用已经配置好的命名 Cloudflare 隧道，本附件不会把隧道令牌写入仓库或日志。

网站进程只绑定 `127.0.0.1:8787`。公网 `https://zhezone.cn` 由本机已有隧道转到这个回环地址。`www` 应重定向到 apex，不要把 apex 或 www 指到 Interview 或 Lab。

## 发布

在仓库根目录执行：

```bash
bash deploy/portfolio-site/publish.sh
```

脚本会：

1. 构建 `examples/portfolio-site`（可用 `--source` 指向其他干净工作树）。
2. 把已构建内容同步到本机用户目录下的发布目录，不把 `.env`、密钥或 Docker 令牌拷进 Git。
3. 仅拉起或重启绑定 `127.0.0.1:8787` 的网站进程。
4. 若命名隧道容器已存在但已退出，则只 `docker start` 这些容器；不会把令牌打印到终端，也不会改 Interview / Lab / API 容器。

如果当前工作树混有 Lab、Interview 或未验收的 API 改动，脚本会拒绝发布，除非明确传入 `--allow-dirty`。不要从混杂的开发分支直接发布。

常用参数：

- `--ensure-only`：不重新构建，只检查网站和隧道是否在跑（供本机守护使用）。
- `--dry-run`：只打印将要执行的动作。
- `--source <dir>`：指定 `examples/portfolio-site` 的来源目录。

停用网站只停止本附件管理的网站进程和 `zhezone-portfwd` / `zhezone-named-tunnel` 两个容器。不要对产品栈执行 `docker compose down -v`。

## 本机守护（可选）

`bash deploy/portfolio-site/install-watchdog.sh` 会把发布脚本复制到当前用户的 Application Support 目录，并安装 LaunchAgent，大约每两分钟检查一次 `127.0.0.1:8787` 和上述两个隧道容器。它只恢复已经发布过的站点，不会自动拉取、提交或把未审查的工作区部署上网。更新脚本后请再执行一次安装。

卸载：`bash deploy/portfolio-site/uninstall-watchdog.sh`。

日志写在 `~/Library/Logs/interview-agent/zhezone-site.log`，权限仅限当前用户。

## 秘密与边界

- 不要把 Cloudflare 隧道令牌、`AGENT_LAB_GATEWAY_KEY` 或其他密钥写入本目录或提交到 Git。
- 不要把隧道令牌写进脚本参数、仓库文件或可被复制进日志的环境文件。
- 本附件不替代 `deploy/portfolio-edge` 的网关密钥注入流程。
- 配置存在、脚本可运行，不代表公网或助手对话已经验收通过。
