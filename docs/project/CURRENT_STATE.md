# Current state

2026-11-10 — 当前唯一主题 LAB-DATA-GOVERNANCE。用户在PR #71合并后要求继续，正在完成资料集合分权的隔离验收与源码交付。主体源码445d572已推送并创建PR #72，后补绑定选框尺寸样式；最新对应CI核验中，未合并/部署；原Lab5175保持此前题库UX镜像，原API/数据卷未改。

前序已交付：Trace排障、历史资料读取、题库上传/主题/按钮体验；PR #71合并main19e911e，push/PR/merge对应默认Product各5绿。原正常管理员会话核对业务16条、RAG142条和展开正文。完整历史对账及真实模型导入质量仍未验收。见QUESTION_BANK_UX.md。

资料分权候选：QUESTION/ARTICLE/DOCUMENT逻辑集合默认私有；READ/WRITE与owner授权管理分开；跨组织复合外键和可信身份；资料修订冲突、逻辑删除、历史/审计禁止UPDATE与DELETE；AgentVersion显式绑定，读取及派发前重新授权，Trace存实际revision/hash引用。旧Interview组织题库和评测数据不迁移。单Agent克隆清空绑定；工作流逐节点校验既有显式依赖。设计见LAB_DATA_GOVERNANCE_WIP.md及架构ADR。

实测：隔离PG新装/升级与DB/HTTP42通过，真实HTTP使用签名JWT/数据库身份/RBAC/DTO/租户上下文（session存储为夹具）；相关runtime/registry53通过；完整API1283通过/47跳过，相关Web385通过，types/lint/API和Lab镜像构建通过。最新标签修复后资料UI8项通过。原全Web一次失败保留，夹具缺新接口已修，旧评测异步用例定向及隔离全套通过，不推断根因。

封闭Docker API136/136通过；浏览器资料创建/编辑/历史/刷新/保存绑定/真实持久Trace/归档拒绝通过。仅一次合成模型调用，无外部请求；拒绝后provider/ledger无增量。原用户资料未用于测试。专用PG备份恢复严格结构/数据/sequence比对通过，版本/授权/归档审计保留。外层本机Docker手动浏览器等待门在回执写入前已退出，后续Redis/向量恢复未运行，不记通过；完整自动门由精确CI验证。精确CI/PR/远端核对尚待完成。

原API启动会自动导入旧知识，可能触发Embedding；本轮没有以未核费用的重启冒充部署。原服务升级需独立备份/迁移/启动成本门。URL/文件提取、通用向量RAG、统一简历、广泛UI、真实模型质量、稳定公网/旧Mac及全产品仍NOT_ACCEPTED。独立实验Python CI的Playwright/Ubuntu兼容失败保留。历史未知费用不补零。
