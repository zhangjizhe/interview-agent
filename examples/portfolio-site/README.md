# Agent Lab portfolio integration example

Portable source mirror of the author-owned portfolio site. Run `npm run build` before starting. Site identity, private environment files and deployment metadata are intentionally absent. The default Agent Lab mode requires a deployed/configured Interview Agent API; it does not simulate an enabled model.

# 张继哲 · 个人网站

个人首页、作品集、在线简历、11 篇旧博客归档和只读资料助手。默认助手通过网站服务端连接 Agent Lab，不在网页中保存 Lab 管理员 Token 或模型密钥。

## 本机运行

Node.js 22.9+，推荐 Node.js 24，无第三方运行时依赖。

```bash
npm run build
npm test
npm start
```

默认 `http://127.0.0.1:8787`。`preview/index.html` 为可离线阅读的静态预览，离线文件不能运行服务端助手。从源码备份运行时允许缺少 `.openai/hosting.json`；本地构建不会因此创建新的托管身份。模板不附带部署身份或秘密。作者站点已完成正常 Agent 发布、真实模型与线上三个问题的限定验收；这不表示新复制的模板已经接通。新部署仍需配置固定已发布版本与服务端接入，证据及限制见 [本轮验收](../../docs/acceptance/PORTFOLIO_ANSWER_QUALITY.md)。

## 接入 Agent Lab

复制 `.env.example` 为私有 `.env`，按实际目标配置：

```dotenv
ASSISTANT_MODE=agent-lab
AGENT_LAB_BASE_URL=http://127.0.0.1:3001/api
AGENT_LAB_PUBLIC_ORIGIN=http://127.0.0.1:8787
```

远程 Lab 地址必须为 HTTPS，路径必须为 `/api`，不包含账号、密码、查询参数或片段；只有 `localhost`、`127.0.0.1`、`[::1]` 可用 HTTP。站点来源必须与真实访问地址完全匹配，例如使用 `localhost:8787` 时不能配置成 `127.0.0.1:8787`。API 地址只保存在服务端，不写进网站 HTML。

Lab 端还必须启用专用作品集助手、配置该站点 Origin 允许列表、签名 Secret、固定的已发布选择器 Agent 版本和真实运行身份。它不是通用 `/chat/completions` 地址；不要把此地址填入 `MODEL_BASE_URL`。缺少配置、围栏拒绝、限额、上游错误或不完整回执时，不回退到旧直连模型。

链路为：浏览器 `/api/chat` → 站点服务端适配器 → Lab 的 `/api/portfolio-assistant/chat` → 有界队列 → 签名票据查询 → 校验后的公开原文与出处。访客无法指定 Agent、模型、租户或知识库，服务端不转发访客的认证凭据。查询票据不透给浏览器，不写入错误信息。

Lab 使用 `portfolio-assistant/v1` 合同。提交只传当前问题和 UUID `requestKey`，后续轮次独立处理，不把旧聊天历史传入 Lab。模型只选择公开资料 ID，答案由 Lab 返回原文摘录；本站 SSE 发送排队状态和完成后的一次正文输出，不能称为模型逐 token 流式生成。来源仅允许站内简历、作品、历史手记、文章路径，以及准确的 `https://github.com/zhangjizhe`。

浏览器在请求前把 UUID 和问题哈希写入同标签页会话存储，不保存原问题。连接中断或停止等待后，“继续确认原请求”复用同一个标识，不自动新建模型请求。明确收到已结束的失败运行时会清除本地准入标识，允许重新提问，但不会自动重试。存在未确认请求时不能悄悄提交不同问题；刷新后需重新输入原问题继续确认。停止只停止等待，不表示撤回后台模型调用或退款。会话存储不可用时失败关闭。

Lab 的 Redis 限额、每日准入上限和真实 Gateway 额度仍是主要边界；本站另有每实例每身份/IP 10 次/10 分钟的保护。这不是跨实例账单或硬费用预留。站点 BFF 出口地址通常在 Lab 看来是一个共享来源；不能把后端按连接 IP 的限制称为精确访客限额。Lab 的去重键按固定运行身份和 UUID 保存，同一请求换出口 IP 不应生成新运行；IP 仅参与限频。去重仍受后端持久化和保留时限约束，需在目标部署验收，不盲信客户端 `X-Forwarded-For`。

## 公开内容与历史资料

- `src/articles.json` 已从 `zhangjizhe/blogWeb` 导入 11 篇实际技术文章，保留 2020 年原日期与正文代码，排除部署测试和空页。
- 本环境尚未找到用户桌面的 `hexo-bolg` 目录，不能把现有 GitHub 导入结果当作已读取该目录；后续应从用户提供的可访问路径导入，并排除草稿、配置和密钥。
- 文章是历史学习记录，可能过时或含代码错误；清洗后可公开展示不等于技术内容已验证。缺失的原图有明确说明。
- 简历和项目介绍来自作者提供的公开页面，不是独立履历或项目效果认证；不声称正式商用、存在付费客户或给出未提供的指标。

## 结构与构建

- `src/base.html`：首页、作品、简历基础内容。
- `src/extra.html`、`src/client.mjs`：文章与助手界面。
- `src/agent-lab.mjs`：Lab 合同、服务端提交/轮询、来源与失败校验。
- `src/app.mjs`：服务路由、请求校验、基础限流与 SSE。
- `src/articles.json`：清洗后的历史文章。
- `src/agent.mjs`、`src/sse.mjs`：兼容旧只读工具 Agent 与 SSE 解析。
- `scripts/build.mjs`：构建独立 HTML 与自包含 Worker；`src/site-html.mjs`、`dist/`、`preview/index.html` 为生成文件。

旧模型适配器只在显式 `ASSISTANT_MODE=direct` 时启用，用于既有私有开发与兼容测试，不能当成已经进入 Lab 围栏和预算控制。仅配置 `MODEL_*` 不会自动启用它。

## 本次验证边界

`npm test` 当前有 24 项实际 Node 测试：原 13 项协议/文章/工具/错误/取消/限流/Worker 检查保留；新增 11 项覆盖默认 Lab、固定来源、HTTPS、请求标识、真实适配器提交/轮询、拒答、来源校验、轮询上限、失败不回退和实际 Worker 产物。上游均是明确的协议模拟器，不证明已经接通目标 Lab 或真实模型。

本次仅修改本地项目，不注册新 Site、不改变 `.openai/hosting.json` 中的项目身份或受众、不调用远程部署。目标 Lab 的实际 HTTP、Redis、数据库与浏览器联调由接入环境另行验证。
