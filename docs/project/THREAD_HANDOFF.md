# Thread handoff

2026-11-19 视觉重做交接：从 origin/agent-lab `7405555` 拉出 `cursor/visual-redesign-f37b`。`packages/design` 提供 Newsreader、IBM Plex Sans/Mono 与按仓库用字裁过的 Noto Sans/Serif SC。个人站 `atelier.css` 在 `scripts/build.mjs` 里和字体 data URI 一起注入；深色仍走原有 `body.dark` 与 `jizhe-theme`。Interview 不新增主题开关。Lab 原生按钮由 `visual-theme.css` 收成主/次/幽灵/危险，资料集合查找与分页在 `DataBindingPicker` 的工具条里。不要把 `examples/portfolio-site/dist`、`preview` 或 `src/site-html.mjs` 提交。未改 API。

2026-11-16 前序：个人网站经 Agent Lab 返回已校验的分段 SSE，详见 docs/project/PORTFOLIO_STREAMING.md。真实网页已在运行完成前两次显示内容，单次模型调用完成且有6条持久流检查点；估算0.000948CNY非账单。相关143项离线回归、类型/Lint/API及Docker构建通过；本机API已部署并保留旧容器及211条既有Run，首次启动参数错误回滚亦保留记录。不是逐Token输出；公网TLS及JSON-only外部网关仍未通过，GitHub最新CI/合并待核验。无数据库迁移、未改鉴权或已发布Prompt、未混入历史网站WIP。

2026-11-10。用户在PR #71合并后要求继续；当前唯一主题LAB-DATA-GOVERNANCE，原暂停候选已经复核并扩充隔离验收。先读LAB_DATA_GOVERNANCE_WIP.md和docs/architecture/LAB_DATA_GOVERNANCE.md。

当前agent-lab基线3c8f089，与main19e911e同tree；前序PR #71已合并，默认Product各组5绿。主体源码445d572已推送PR #72，最后补选框布局，最新CI待核；尚未合并/部署，原5175仍题库UX镜像，原API/数据库/全部卷未重启或迁移。

修改包括typed集合/ACL/复合外键/不可变历史与审计、当前身份/修订冲突、版本绑定/派发前重验授权、data.read实际revision/hash、克隆清空单Agent绑定、Lab资料页与选择器。旧Interview题库、历史RAG、评测Dataset仍独立；不提供任意表读写或通用向量RAG。

证据：真实PG新装/旧升级及DB/HTTP42；runtime/registry53；完整API1283通过/47跳过（专用DB另跑）；隔离完整Web385；标签后UI8；types/lint/API与Lab Docker构建通过。封闭API136/136通过，浏览器create/edit/history/reload/binding/一合成调用/持久Trace/archive拒绝与无调用增量通过，截图已视觉检查。专用PG备份恢复通过，严格结构/数据/sequence及版本/授权/审计保留。外层Docker手动等待门在回执文件前已退出，后续恢复未跑，不计通过；完整自动门与精确CI/PR/远端待核。

首次失败保留：旧夹具懒PrismaPromise出ALS已修并保留拒绝断言；首轮全Web的缺新GET夹具已补，旧评测异步用例定向与隔离完整套件通过，根因未知。浏览器先缺捆绑Chrome，后发现select/有值textarea的标签识别问题，已加明确可访问名称。旧失败的合成资料保留，复验用唯一新名称，未删除失败记录制造通过。

候选隔离目录与日志保留本机临时位置；不提交本机绝对路径、私有回执或敏感配置。当前仅资料治理相关WIP纳入候选；认证证据、portfolio三文件、auth档案、旧Mac手册保持原样，禁止全部暂存。无外部模型请求；合成结果非语义质量。

注意原API的KnowledgeBaseBootstrap会启动旧知识导入，可能付费。本轮不可未经成本核验就重启原API或声称本机资料治理已上线。后续原部署需备份/迁移/启动成本门；简历、通用提取RAG、真实质量、全产品NOT_ACCEPTED。当前阶段完成后等待用户继续下一阶段。
