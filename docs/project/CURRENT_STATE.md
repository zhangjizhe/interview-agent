# Current state

2026-11-19 视觉改为明亮冷白 `#F7F8FC`、正文 `#23243A`、主色 `#6456DC`；展示与界面字体为 Plus Jakarta Sans + Noto Sans SC。个人站首页仍是引文，不再使用代码卡片。Lab 眉题仍是中文工作室用语。三端视觉重做（个人站、Interview、Agent Lab）收成同一套字体、色彩、图标笔画和控件。共享层在 `packages/design`（自托管 OFL 字体子集与 CSS 令牌）。个人站样式在 `examples/portfolio-site/src/atelier.css`，构建时内联字体；Interview 用同一令牌重映射 Tailwind；Lab `visual-theme.css` 覆盖控件，资料绑定改为工具条。未改路由、鉴权、API、SSE、预算或发布门禁，未新增产品功能。本轮验证：portfolio Node 测试 33 通过；Web Vitest 385 通过；Web/Lab `tsc` 与 Vite 构建通过，产物含 woff2；改动过的 TSX eslint 无警告。本地预览核对首页/作品/文章/简历/小哲助手、深色首页、Interview 登录与工作台、Lab 登录/控制中心/编排/资料绑定/MCP/数据治理。未做自动化对比度扫描，未部署，线上 zhezone.cn 未因本分支更新。CI 尚未在本提交上核验。Agent Lab 与 Web 的 Docker 构建在安装前拷贝 `packages/design/package.json`，并在打包前拷贝该目录，否则冻结锁文件与 CSS 导入无法在镜像内解析。

2026-11-16 当前唯一任务：个人网站经 Agent Lab 返回已校验的分段 SSE，详见 docs/project/PORTFOLIO_STREAMING.md。真实网页已在运行完成前两次显示内容，单次模型调用完成且有6条持久流检查点；估算0.000948CNY非账单。相关143项离线回归、类型/Lint/API及Docker构建通过；本机API已部署并保留旧容器及211条既有Run，首次启动参数错误回滚亦保留记录。不是逐Token输出；公网TLS及JSON-only外部网关仍未通过，GitHub最新CI/合并待核验。无数据库迁移、未改鉴权或已发布Prompt、未混入历史网站WIP。

2026-11-10 — 当前唯一主题 LAB-DATA-GOVERNANCE。用户在PR #71合并后要求继续，正在完成资料集合分权的隔离验收与源码交付。主体源码445d572已推送并创建PR #72，后补绑定选框尺寸样式；最新对应CI核验中，未合并/部署；原Lab5175保持此前题库UX镜像，原API/数据卷未改。

前序已交付：Trace排障、历史资料读取、题库上传/主题/按钮体验；PR #71合并main19e911e，push/PR/merge对应默认Product各5绿。原正常管理员会话核对业务16条、RAG142条和展开正文。完整历史对账及真实模型导入质量仍未验收。见QUESTION_BANK_UX.md。

资料分权候选：QUESTION/ARTICLE/DOCUMENT逻辑集合默认私有；READ/WRITE与owner授权管理分开；跨组织复合外键和可信身份；资料修订冲突、逻辑删除、历史/审计禁止UPDATE与DELETE；AgentVersion显式绑定，读取及派发前重新授权，Trace存实际revision/hash引用。旧Interview组织题库和评测数据不迁移。单Agent克隆清空绑定；工作流逐节点校验既有显式依赖。设计见LAB_DATA_GOVERNANCE_WIP.md及架构ADR。

实测：隔离PG新装/升级与DB/HTTP42通过，真实HTTP使用签名JWT/数据库身份/RBAC/DTO/租户上下文（session存储为夹具）；相关runtime/registry53通过；完整API1283通过/47跳过，相关Web385通过，types/lint/API和Lab镜像构建通过。最新标签修复后资料UI8项通过。原全Web一次失败保留，夹具缺新接口已修，旧评测异步用例定向及隔离全套通过，不推断根因。

封闭Docker API136/136通过；浏览器资料创建/编辑/历史/刷新/保存绑定/真实持久Trace/归档拒绝通过。仅一次合成模型调用，无外部请求；拒绝后provider/ledger无增量。原用户资料未用于测试。专用PG备份恢复严格结构/数据/sequence比对通过，版本/授权/归档审计保留。外层本机Docker手动浏览器等待门在回执写入前已退出，后续Redis/向量恢复未运行，不记通过；完整自动门由精确CI验证。精确CI/PR/远端核对尚待完成。

原API启动会自动导入旧知识，可能触发Embedding；本轮没有以未核费用的重启冒充部署。原服务升级需独立备份/迁移/启动成本门。URL/文件提取、通用向量RAG、统一简历、广泛UI、真实模型质量、稳定公网/旧Mac及全产品仍NOT_ACCEPTED。独立实验Python CI的Playwright/Ubuntu兼容失败保留。历史未知费用不补零。
