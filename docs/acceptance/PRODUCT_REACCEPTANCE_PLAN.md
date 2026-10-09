# 产品全链路重新验收计划

更新：2026-10-08 · PRODUCT-REACCEPTANCE-1 · 基线 e515afa

状态：Phase 0 清单与验收门完成；产品全链路尚未重新验收，不交付为“全部通过”。这是当前真实可达产品的验收规划，未来愿景功能不能冒充已实现功能。旧验收结果仅作回归线索，所有条目本轮从未验收开始。

## 必须遵守的交付门

1. 每项功能先记录用户目标、输入、前置、结果、权限、数据来源、成本和失败恢复合同；实现与旧规格冲突时先明确最终产品行为，不能由测试迁就缺陷。
2. 每个交互和展示需二次确认：第一次核对 API 状态/数据库或向量读回/状态机及计算；第二次从真实浏览器核对输入、操作、文字、数值、列表、禁用条件和刷新后结果。两次使用不同证据来源；不把同一测试跑两遍当二次确认。
3. 每项记录测试账号类型与组织、合成输入、版本/镜像摘要、操作步骤、预期、实际、时间、API/持久化证据、截图/DOM证据、复测和结论。不得保存密码、token、API Key、个人简历或原始敏感日志。
4. verdict 只允许 NOT_ACCEPTED / PASS / FAIL / BLOCKED / NOT_SHIPPED；PENDING 不能计入通过。失败或无证据不发布；NOT_SHIPPED 需核对页面未承诺可用，不能用于掩盖已展示的未实现能力。
5. 修复必须先保留复现证据，加入回归，再在实际新镜像复测当前项、依赖项及受影响跨功能链；独立主题提交。部署前备份并执行独立 migration，禁止搬组织、清账本、删安全状态或绕过权限让测试变绿。
6. 功能覆盖率分母是完整运行时展开后的台账：每个动态列表模板在空/单项/多项状态展开，每个select选项与条件分支、弹窗、分页、响应式与错误状态均单独记录。覆盖表缺项即验收门失败。
7. 未确认真实模型账单/额度和新的有界预算时，不运行付费推理或外部有成本动作。离线fixture只证明工程合同。真实AI全链路未通过时整体保持 BLOCKED，不以隐藏条目宣称通过。
8. 最终交付必须绑定固定 Git SHA、镜像与配置合同、完整覆盖清单及远端 CI 证据，所有相关 FAIL/BLOCKED 清零后方可声明本次产品范围通过；生产部署、学习效果、模型质量分别有证据，不能互相代替。

## 当前实现与证据缺口

- 当前 Interview 路由：/、/practice、/interviews、/training、/settings、/reports/:id、/interview/:id；旧 /question-bank、/tools、/admin/mcp 是兼容跳转。Lab 11视图由单页内部导航管理。
- 产品 INFORMATION_ARCHITECTURE/USER_JOURNEY/SCREEN_SPEC 为 2026-08-13 设计，有过时实现描述；Phase 1 逐条与代码和产品合同对齐。未来 /skills、独立 /usage、候选人知识库等不直接纳入“已实现”，但可达入口/承诺必须检查。
- CI 有 lint/type/test/PG/镜像HTTP，未执行浏览器交互脚本。report-ui 使用 route mock，不能证明真实报告生成。admin-mcp 固定管理员，缺新组织生命周期。旧 pm-full-flow 仍用早期 /api/user、URL userId 和旧文案；必须先审计迁移，不能直接引用为通过证据。
- 最新 Lab 修复已证明跨组织首次dashboard与实际浏览器控制中心；它不能替代下面全部功能重新验收。历史测试数不是逐控件覆盖率。

## 源码控件台账

[UI_INVENTORY.json](UI_INVENTORY.json) 枚举12个当前可达页面/组件的 JSX：673项，其中144个交互节点、529个展示节点，全部 NOT_ACCEPTED。这是源码模板清单，不是673项运行时通过证据；包装元素可能重叠，动态模板会展开为多项，CSS伪元素及实际无障碍状态仍需浏览器补齐。没有按数量推导覆盖率。

## 功能级产品合同与验收矩阵

所有行当前状态 NOT_ACCEPTED；引用现有测试仅表示可复用资产，未代表本轮执行。

| ID | 功能 | 交互/展示 | 产品验收合同 | 必验边界 | 后端/持久化核对 | 可复用测试/缺口 |
| --- | --- | --- | --- | --- | --- | --- |
| I01 | Interview 认证 | 注册/登录/模式切换/校验/处理中/错误 | 身份唯一；成功会话与数据库身份一致；失败无会话 | 新账号、既有账号、保留名、短密码、重复注册、401/429/502 | auth/register/login/profile；User；Redis session | auth-real-acceptance.mjs；auth tests |
| I02 | Interview 导航与退出 | 桌面/移动导航、退出、旧路由跳转 | 路由和活动态一致；退出服务端吊销；迟到响应不清新会话 | 未登录、会话过期、退出失败、并发登录、刷新/深链 | auth/logout；AppShell；auth transport | AppShell/auth tests；auth-real-acceptance.mjs |
| I03 | 岗位设置 | 创建/编辑/激活/取消、字段限制、岗位列表 | 岗位归属当前用户；编辑版本递增；当前岗位唯一 | 无岗位、多岗位、重复点击、非法输入、失败重试、跨组织 | target-jobs CRUD/activate；Job version | Settings/Home tests；auth-real-acceptance.mjs |
| I04 | 首页准备度 | 岗位、准备度、技能、置信度、下一步 | 每个数值可追溯正式证据；未评估不伪造分数 | 新用户、无简历、无证据、低证据、多岗位、加载/错误 | readiness；formal evidence；skill state | HomePage tests；HTTP training fixture |
| I05 | 使用量展示 | 余额、调用量、费用、重置时间 | 单位/统计周期/聚合与账本一致；未知费用不显示零 | 无使用量、配额耗尽、失败调用、月份边界、接口错误 | usage/summary；UsageLedger/Quota | quota tests；需要逐字段浏览器复核 |
| I06 | 简历上传与确认 | 选择文件/上传/解析/状态/确认 | 受限文件类型大小；仅当前用户；确认后才能个性化 | 空/超大/非法格式、重复上传、解析失败、旧简历、401 | upload-resume/resumes/confirm-resume；vector data | 现有上传/API测试；旧 content 脚本须审计 |
| I07 | 练习设置 | 完整模拟/单技能、技能选择、取消/开始 | 岗位/简历/模式/技能持久化一致；缺前置禁用 | 无简历/岗位/技能、双击、超额、创建失败 | interview/start；quota；Interview | Home tests；浏览器真实完整链路待补 |
| I08 | 面试记录 | 状态卡、继续、报告、重试评价、空房删除 | 操作与会话状态匹配；历史不覆盖；删除只影响合成授权范围 | 进行中/完成无报告/失败/空房、分页/刷新、跨用户 | list/empty-rooms/end/DELETE；Interview | Home tests；HTTP ownership |
| I09 | 面试房间首屏 | 简历确认、题目、岗位/技能/进度、侧栏 | 恢复已有会话；当前题目与后端一致；无内部信息泄露 | 直接深链、刷新、404/403、无题、移动抽屉 | interview/:id；store；ChatBubble | 旧 streaming/pm 脚本先迁移合同 |
| I10 | 回答与 SSE | 编辑器、提交、流式内容、加载/停止/完成 | 回答只保存一次；流结束解除等待；事件顺序可核对 | 空输入/长输入/双击/断网/超时/断流/重复事件 | message SSE；LangGraph；formal evidence | API SSE tests；真实浏览器事件回归待补 |
| I11 | 面试状态控制 | 结束、稍后继续、追问、人工等待展示 | 状态后端持久化；完成后禁止再答；失败可恢复 | 提前结束、进行中结束、刷新、错误/取消、过期 | end；HITL graph-status；Interview lifecycle | Interview tests；完整浏览器验收待补 |
| I12 | 报告与证据 | 分数、解释、回放、证据卡、下一步 | 字段逐一对照正式报告/证据；低置信度标记；不漏内部数据 | 报告未生成、失败、无证据、跨用户、长内容、移动 | interview/:id/evidence；Report | Report tests；report-ui mock仅展示 |
| I13 | 定向训练 | 刷新推荐、完成、复测、关联状态 | 推荐源于正式证据；完成不提升分数；复测创建关联新尝试 | 无推荐、重复完成、并发、失败/重试、不同岗位 | training-recommendations；attempts；skill state | Training tests；verify-training-loop.cjs |
| I14 | 复测成长闭环 | 新面试/训练复测到新报告与历史对比 | 同技能可比证据更新一次；保留原记录及关联 | 可比/不可比、重复结算、部分失败、刷新恢复 | Interview/Evidence/Skill/Training | 真实 PG/HTTP已有，浏览器/真实效果待验证 |
| L01 | Lab 认证与权限 | 登录/注册、角色提示、退出、异常重试 | USER拒绝控制面；ADMIN可进入；展示权限与后端一致 | 首次独立组织、授权后登录、撤权旧会话、401/403/404/502 | auth；roles；dashboard initial queries | 新增 HTTP fixture；固定浏览器脚本待扩展 |
| L02 | Lab 全部导航 | 11视图、加载、错误、空数据、退出 | 每项导航可达；非认证故障重试不误导为权限问题 | 新/旧组织、刷新、过期、慢接口、键盘、移动 | main.tsx view map；api.ts | admin-mcp-acceptance.mjs部分覆盖 |
| L03 | 控制中心 | MCP健康/数据集/失败/发布记录/拓扑 | 动态值对照 API；静态架构明确标记；同组织数据 | 全空、初始化并发、多组织、失败/部分依赖 | dashboard；MCP list；LabDataset | 真实 PG/HTTP初始化；逐字段浏览器待验 |
| L04 | 运行编排 | 阶段、运行卡、预算/状态与可见性 | 静态示意不冒充真实运行；内部推理不泄露 | 无运行、运行中、失败、取消、长记录、刷新 | runtime runs；stage summaries | runtime/trace tests；浏览器证据待验 |
| L05 | MCP 治理 | 逐服务健康检查、系统开关、重载 | 配置权限/持久化/健康状态一致；未接入不得显示可用 | 启用/禁用、服务故障、重复点、外部凭据缺失 | admin/mcp-servers/health/toggle/reload | admin-mcp browser覆盖部分；真实外部检查另控成本 |
| L06 | 题库筛选 | 岗位/关键词、搜索、清除、列表 | 查询参数/分页/结果一致；空结果可解释 | 无题、无结果、特殊词、超限、失败、跨组织 | question-bank list/search；Milvus | QuestionBankWorkspace tests；向量fixture |
| L07 | 题库写入 | 新增/关闭/字段/保存/删除确认 | 先验证输入；持久化读回；删除准确ID；未知写入不报成功 | 非法/超限/重复/并发/失败/确认取消/部分向量故障 | question-bank add/delete；embedding；Milvus | 真实 Milvus HTTP回归；浏览器全控件待验 |
| L08 | Trace | 列表、阶段、摘要、导出/展示 | 与真实运行一致；脱敏；下载内容可解析 | 无记录、失败/取消、分页、大内容、跨组织 | runs/trace；trace bundle | trace tests；独立浏览器内容待复核 |
| L09 | 录制评测报告 | 导入列表/详情/导入/失败状态 | fixture来源明确；录制不能冒充真实模型质量 | 重复导入、校验失败、幂等、跨组织、错误恢复 | recorded-imports；LabRun | Lab service tests；admin-mcp browser部分覆盖 |
| L10 | 实验比较 | Control/Treatment选择、兼容筛选、创建、展示 | 不同版本同集可比；拒绝自比较；指标与结果来源一致 | 不兼容/空集/失败、重复、跨组织 | experiments；comparison | Lab service；录制浏览器覆盖部分 |
| L11 | 录制发布记录 | 选择APPROVE/REJECT/NEEDS_REVIEW、理由、记录 | 只记录人工决定，不改变实际Agent发布状态 | 无记录、失败/重复、非ADMIN | release-decisions；operation logs | Lab service；录制浏览器覆盖部分 |
| L12 | 审计 | 种类/数据集/版本/状态/日期/分页 | 过滤参数与结果、总数、页码一致；仅本组织 | 空数据、日期逆序、分页末页、刷新、失败 | audit endpoints | service tests；浏览器逐项待验 |
| L13 | 操作日志 | 动作/对象/结果/日期/分页 | 成功与拒绝都可追溯；日志不泄露凭据或个人数据 | 空、拒绝、边界日期、分页、错误/恢复 | operation-logs | service tests；浏览器逐项待验 |
| L14 | 自进化基础资产 | bootstrap/Agent/版本/数据集/Evaluator选择与创建 | 持久化读回；隔离；状态及版本来源准确 | 新组织全空、重复初始化、权限不足、失败 | agents/versions/datasets/evaluators | ControlledEvolution component；API tests |
| L15 | 发布数据集治理 | Case添加、冻结、审查、版本/资产展示 | 冻结后不可改；格式/覆盖/审查证据完整 | 缺Case/无效输入/重复冻结/冻结后写/跨组织 | dataset cases/freeze/review；immutable data | dataset SQL/API tests；浏览器完整待验 |
| L16 | 候选版本 | 创建/选择/版本状态/指纹 | DRAFT不成为当前正式版；配置/资产可追溯 | 缺前置、相同版本、错误/并发、跨组织 | evolution/candidates；AgentVersion | controlled evolution tests；浏览器待验 |
| L17 | 真实评测任务 | 重复次数/预算/基线/候选启动/进度/取消 | 202任务持久化；幂等；样本边界取消；准确费用小计 | 超额、超时、断网、重启、租约过期、重复/取消竞态 | evaluations；jobs；Quota；Ledger | job PG/API/tests；真实模型预算待明确 |
| L18 | 实际对比与发布 | 同集对比/证据门/发布按钮/结果 | 仅完整通过证据门可发布；录制不解锁真实发布 | REJECT/缺证据/不兼容/失败、权限/并发 | comparison；publish；release gate | release tests；真实固定集此前失败 |
| X01 | 可访问性与展示 | 全部标签/键盘/焦点/布局/格式/单位/文案 | 标签可理解；图表与原始值一致；长文本不遮挡 | 桌面1440、平板768、移动390；空/长数据/错误 | 全部 UI_INVENTORY 条目与CSS | 现有截图不是全覆盖；本轮逐条复核 |
| X02 | 部署与数据恢复 | readiness、DNS、迁移、故障、恢复 | 新旧部署合同一致；数据保存；认证状态不清空 | API重建、PG/Redis/向量断开、恢复、旧库升级 | Compose/nginx/migration；PG/Redis/vector | verify-phase2/built-api；前端故障浏览器待补 |

## 分阶段执行

| Phase | 工作与退出门 | 状态 |
| --- | --- | --- |
| 0 | 当前路由/控件/展示台账、功能合同、测试资产缺口、真实费用边界和交付门；不修改业务代码 | 完成清单，不代表产品通过 |
| 1 | 校准产品规格；独立合成组织/新账号/普通用户/管理员，运行真实API与浏览器全控件检查；补CI浏览器门与失败项回归；所有非付费功能逐条二次确认 | 已获用户继续；基础阻断阶段测试中 |
| 2 | 三端实际镜像、迁移/备份/恢复、API重建DNS、依赖故障/慢接口/会话竞态/刷新恢复、跨组织安全与响应式；重测受影响链 | 待执行 |
| 3 | 核对额度/未知账单与明确预算后跑真实简历→面试→报告→训练→复测及Lab真实评测/比较/发布拒绝与可允许路径；账本/费用/质量分别核对 | 预算与前置未满足，BLOCKED |
| 4 | 固定构建全回归、覆盖台账无遗漏、失败修复后二次确认、远端CI、交付报告和剩余风险；所有范围项通过才交付 | 待执行 |

用户最新指令要求自主连续完成，覆盖此前逐Phase等待规则。后续阶段持续围绕验收与必要修复，不批量重构或增加未来功能。所有者的权限变更仍逐目标确认；合成隔离fixture可在测试范围内建立角色，不修改业务账号。

## 黄金链路与交叉检查

- 新用户注册 → 设置岗位 → 上传并确认合成简历 → 完整模拟 → 回答/追问/SSE → 结束 → 正式报告/证据 → 训练推荐 → 完成 → 关联复测 → 同技能证据更新 → 退出 → 再登录/刷新恢复。
- 无历史管理员 → 初始化独立组织 → 每个Lab视图空状态 → 创建合成资产 → 题库查写 → 录制导入 → 实验 → 录制决定 → 审计/日志 → 真实评测受控任务 → 取消/故障恢复 → 独立发布门；记录决定与实际发布分别验收。
- 普通用户拒绝管理入口 → 隔离fixture授予 → 重新登录 → 全部初始请求 → 隔离fixture撤权 → 旧会话管理请求拒绝 → 其他账号保持；服务端与前端都核对。
- 两条链每一步持久化读回与浏览器复查，失败不跳过下游；外部调用先过预算门。删除仅针对明确可删除的隔离合成数据；生产动作不作为测试探针。

## 每条运行时验收记录模板

```text
caseId / UI IDs / featureId:
commit / imageDigest / environment / syntheticFixture:
productContract / role / organization / preconditions:
stateBranch / viewport / interactionSteps:
expectedApiAndPersistence / actualApiAndPersistence / evidencePath:
expectedDisplay / actualBrowserDisplay / screenshotOrDOMPath:
failureRecovery / regression / secondCheckTime:
verdict / blocker / fixCommit / verifiedCommit:
```

每个展示数字明确公式、分子分母、范围、单位、精度/舍入、空值与时间时区；静态示意单独标记，真实状态与数据来源绑定。输入/按钮检查标签、禁用、pending、重复点击与错误恢复；下载校验文件类型/内容/归属；分页校验全量和末页；所有错误保持具体原因。

## Phase 0 验证和未完成

已从当前路由和实际导入组件建立源码台账，核对功能/API入口与CI脚本；JSON解析、唯一ID、源码路径/行号、144/529计数与全未验收标记通过。未运行本轮功能/浏览器/模型重新验收，未更改业务行为、schema、API、权限或运行配置，AI Benchmark不适用于本阶段。完整产品测试仍为活动任务，Phase 0 文档不能作为产品交付报告。

## 用户新增范围

用户要求自定义 Agent 与真实编排，并授权独立测试 Agent。新增合同与阶段退出门见 [Lab Agent 与编排合同](LAB_AGENT_WORKFLOW_CONTRACT.md)，不再以固定 Interview 适配器或静态画布视为已实现。新增范围全部 NOT_ACCEPTED；先修基础阻断，再按阶段完成 Agent、工作流与整体双证据验收。
