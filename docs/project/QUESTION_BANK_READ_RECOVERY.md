# 历史题库读取恢复

2026-11-10。当前唯一活动主题 QUESTION-BANK-READ-RECOVERY。用户补充：记忆中的题量为上百条。代码基线 agent-lab / `54efb535016913830d539959b0c41a5fea0a6f31`；该提交的 Trace PR #71 未通过远端 Product CI，未合并。不要以旧绿灯认证本轮候选。

## 源码已核对

- Lab `main.tsx` → `QuestionBankWorkspace` → Interview question-bank list。`QuestionBankService.list` 在组织未采用 PostgreSQL catalog 时进入 legacy `QuestionVectorIndexService`，集合基名 `question_bank_v2`，存储为 Milvus。原页面只覆盖此业务题库。
- 另一条独立历史链：`KnowledgeBaseController.listAll/listByTopic` → `KnowledgeBaseService.list/listByTopic` → 当前可信组织的 Qdrant collection，基名 `interview_knowledge_base`。默认组织保留旧未加后缀的集合，其他组织使用独立后缀；缺少组织上下文必须拒绝。内存缓存也按组织区分。
- 这两个 GET 是读取，不需要 embedding。现有 list 包装的 total 是返回页条数，不能当作全库总量。现有返回不含原始 source 链接，页面不得补造。
- 仓库两个知识 JSON 各142条，不能相加为284，也不能仅凭文件证明数据库完整。KnowledgeBaseBootstrap 存在启动导入路径，会调用 embedding；本轮没有重启 API、调用导入或重建索引。

## 本轮实际验证：原存储与旧页面

- Docker Desktop 只读检查发现原 Milvus 已退出，原 Qdrant 已停止；原容器与命名卷仍在。Milvus 日志记录 etcd lease/连接丢失后退出，OOMKilled=false；尚未证明最初根因或长期稳定性。
- 通过 Docker Desktop 启动同一已有 Milvus、Qdrant 容器。保留 `interview-agent_milvus_data`、`interview-agent_qdrant_data` 和原 loopback 端口；没有重建/换卷、删除、迁移、复制或重导数据。
- 正常已登录 Lab 旧业务题库恢复显示16条，并展开一条已保存的参考答案。16是实际加载的记录数，不是用户全部历史题量的结论。
- 本机 Qdrant Dashboard 显示 `interview_knowledge_base` READY、POINTS(APPROX)142；实际打开历史 LangGraph Checkpoint 条目并看到其主题/正文/标签和 interview-qa-bank 来源。另有 semantic_cache，未混计。
- 这是实际存储证据；尚未完成完整历史清单/哈希对账，不能保证用户记忆中的全部题目均完整。新 Lab 入口仍未部署、未通过真实 API/浏览器二次验收。

## 本地候选实现

- `KnowledgeLibraryPanel.tsx` 与专属样式，接入题库页面的“业务题库 / RAG 知识资料（只读）”切换。业务题库原编辑/采用流程保留，进入资料页不主动读取另一题库。
- 复用既有认证 GET `/knowledge-base/list?limit=200`。15秒读取上限、显式重试、标题/主题/标签本地筛选、已加载数量与200条上限；不把包装 total 伪装成总量。
- 校验返回形状、重复ID与标签，正文显式展开并以纯文本展示；超长正文标明截断。403/503/超时/非法返回不显示为空资料库。
- `KnowledgeBaseService.list/listByTopic` 的存储异常由静默成功空数组改为503。仅记录事件/操作名，避免原始错误携带敏感配置。合法空结果仍为空。
- 不新增表、API路径、授权、Agent绑定、导入、写操作或模型调用；现有组织边界保持。此只读入口不等于 collection ACL/通用文章 RAG 已交付。

## 本轮本地验证

- Web 新资料组件7项通过：既有GET、加载数量/本地筛选、显式纯文本、403/503及重读、非法/重复响应、合法空库。
- API 新读取回归与既有 tenant-knowledge 共12项通过：503区别于空库、缺租户拒绝、默认旧集合、跨组织/主题与缓存隔离、读取不启动模型。
- Lab/Web 类型与相关 lint 通过；从 HEAD 隔离候选中排除独立 DataGovernance WIP 后，Lab 类型/生产构建与 API 类型通过。依赖复用现有安装；这不是新 Docker 镜像验收。
- 修正了新测试中误将说明文字“已加载”匹配为成功状态的定位器，保留非法响应不得显示成功数量的断言。没有删除失败用例。
- 工作区 diff 检查通过；33份既有无关文件的SHA-256指纹及共享Builder文件指纹保持一致。共享main增量已与排除治理WIP的隔离候选逐字比较。新增代码尚未提交/推送；尚无对应 CI、实际页面或全量产品通过结论。
- 本轮只读恢复与测试无新外部模型调用；历史未知费用保持未知。未执行 embedding 或历史失败模型重放。

## 原阻塞记录与后续顺序

自动审批服务此前对修订 Trace Docker 构建的审核因使用额度耗尽未能完成，不是模型 API 余额不足。没有绕过该拒绝去构建/部署镜像。当前不能宣称新 Trace 修复或知识入口已在5175生效。

1. 审批可用后先按 TRACE_DIAGNOSTICS_WIP 修复并验证未完成 Trace gate；不得混入未验收数据治理/schema/runtime修改，也不盲目重跑失败CI。
2. 隔离本主题的组件/样式、main知识入口增量、service/read测试与相关文档；main另有独立治理增量，禁止整文件无审核提交。
3. 保持API启动导入风险可控、核查私有预算；复用原卷部署时避免不必要的 API 重启和付费重导。新API503需实际镜像验证，不能因源码存在就当生效。
4. 正常管理员会话通过新入口读取真实资料，核对加载数/典型正文/本地筛选/失败恢复；禁止从调试浏览器提取令牌绕过登录或权限。
5. 相关完整检查与 diff → 精确源提交/推送 → 最新对应CI全绿 → PR合并main与远端读回。阶段通过后等待用户继续分权/简历/URL文件RAG。

2026-11-10 后续更新：本轮审批已恢复可用。新Lab前端实际部署后，经正常管理员GET读取142条、Checkpoint本地筛选12条并展开正文；业务16条保持。仅服务端503改动仍未部署；完整历史对账和真实模型导入未完成。详见 QUESTION_BANK_UX.md。
