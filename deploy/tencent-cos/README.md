# 腾讯云香港 COS 静态上传

把个人站、Interview 和 Agent Lab 的静态文件上传到香港地域的私有 COS 桶。密钥只从环境变量读取，脚本不会打印密钥，也不会把密钥写入仓库或日志。

上传成功只说明对象已进桶，不等于腾讯云 CDN 已能回源，也不等于应该修改 Cloudflare 解析。在四个 CDN 域名对可公开访问的 HTTPS 返回 200、并核对文件尺寸之前，不要切换 `zhezone.cn`、`www`、`interview` 或 `lab`。不要改 `portfolio-api.zhezone.cn` 或其他 API / 隧道主机名。不要把本机 `8787` 端口暴露到公网。不要重建或重启 Interview、Lab 或 API 来完成本上传。

## 准备

在一个目录里放好三个子目录：`site/`、`interview/`、`lab/`，各自包含 `index.html`。不要把 `.env`、密钥文件或 `SecretKey.csv` 放进这些目录。

在仓库根目录安装依赖：

```bash
python3 -m venv deploy/tencent-cos/.venv
deploy/tencent-cos/.venv/bin/pip install -r deploy/tencent-cos/requirements.txt
```

在当前 shell 导出 `COS_SECRET_ID` 和 `COS_SECRET_KEY`。不要用 `echo` 或 `printenv` 核对，也不要把它们写进仓库文件、提交到 Git，或贴进聊天、文档和截图。

默认桶（地域 `ap-hongkong`，可用环境变量覆盖）：

- `COS_BUCKET_SITE`，默认 `zhezone-site-1258856416`
- `COS_BUCKET_INTERVIEW`，默认 `zhezone-interview-1258856416`
- `COS_BUCKET_LAB`，默认 `zhezone-lab-1258856416`

地域可用 `COS_REGION` 覆盖。

## 上传

```bash
deploy/tencent-cos/.venv/bin/python deploy/tencent-cos/upload_to_cos.py --root /path/to/trees
```

也可以改用环境变量 `COS_UPLOAD_ROOT`。脚本会设置常见 `Content-Type` 和 `Cache-Control`，并尽量把静态网站的 Index / Error 设为 `index.html`。私有桶的公共 COS 地址返回 403 是预期行为；公网访问应走腾讯云 CDN，且必须在控制台把源站设为 COS 源，并授权私有存储桶访问。

## 切换后的接口

COS 没有产品栈里的 Nginx。三个前端的同源 `/api` 在解析切换后会失败，需要另留隧道主机名或配置 CDN 路径规则。本脚本不处理 API，也不注入 `AGENT_LAB_GATEWAY_KEY`。
