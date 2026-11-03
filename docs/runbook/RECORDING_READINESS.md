# 录屏准备与证据边界

核对日期：2026-11-02。本文是按源码核对的操作路线，不是运行通过证明。本轮核对环境没有 Docker，以下容器、浏览器和真实模型路线均未在本机执行。开始录制前，以目标提交的完整 CI 和目标电脑预演结果为准。

## 两种模式

| 模式 | 用途 | 数据与模型 | 入口 |
| --- | --- | --- | --- |
| 本机产品部署 | 展示实际面试产品与管理链路 | 持久化本机业务库；模型调用使用私有配置的真实 Provider，可能付费 | Interview `http://localhost:5173`，Lab `http://localhost:5175`，API `http://127.0.0.1:3001/api` |
| 隔离合成验收 | 展示工程合同、状态、权限、持久化和发布拒绝 | 临时 PG/Redis/Milvus/Qdrant，localhost 合成 Provider，内部网络阻止外部模型 | Lab `http://localhost:5176`；候选人 `http://localhost:5177`，按脚本顺序分别启动 |

合成 Provider 的 token/费用是测试用量和估算，不是外部供应商真实账单。Golden 的固定 45→80 分由测试 profile 控制，不能称为模型准确率、真实学习提升或商业验收。独立的 `report-ui-acceptance.mjs` 还会 mock API，仅证明报告呈现，不证明业务闭环。

本轮检查起点的 PR #64 集成验收曾因样本运行中断、费用证据不可用失败；浏览器和恢复检查未因此次运行完成。该失败需在最终提交修复并重跑后单独核对，不能用基础测试成功替代。真实模型的历史未知费用尚未对账，本文不授权自动付费调用。

## 本机产品部署

遵循 [产品运行手册](../runbook.md) 和 [管理员权限 SOP](../ADMIN-ACCESS-SOP.md)。从 `.env.example` 准备私有 `.env`，不要覆盖已有配置。需要有效数据库配置、至少 32 字符随机 `JWT_SECRET`，以及获准使用的 Provider 配置；不要录下凭据、认证请求体、Bearer token、简历个人信息或私有日志。

在仓库根目录执行：

```bash
docker compose config --quiet
docker compose up -d --build api web agent-lab
docker compose ps
curl --fail http://127.0.0.1:3001/api/health/ready
```

已有数据升级前先备份；migration 服务成功且 readiness 成功后才开始。不要使用删卷、重置数据库或 `db push` 消除故障。`ADMIN_USER_IDS` 只在注册时为匹配账号创建管理员；改变名单不会自动改变已有数据库角色。授权操作按 SOP，由部署所有者指定账号与环境执行。

### Interview 产品录屏顺序

1. 在 `:5173` 注册/登录演示账号，进入 `/settings` 创建目标岗位，填写岗位、级别和 JD，保存为当前岗位。
2. 回到 `/` 上传不含个人信息的合成简历，等待“简历已更新”及实际保存确认。准备阶段使用的模型/Embedding 调用可能付费。
3. 点击“开始模拟面试”，选择完整模拟，创建后进入 `/interview/:id`。确认简历后等待真实当前题目；展示题目与会话状态，不向候选人展示参考答案。
4. 回答当前题目，观察 SSE 和下一题状态。实际异常应显示并核验，不用刷新、重复提交或手工改库掩盖未知结果。
5. 点击“结束并生成报告”，成功后进入 `/reports/:id`，查看问题、回答和评价依据。报告未生成则保留失败状态，不以 UI 截图替代。
6. 进入 `/training`，点击“更新建议”，仅在确有正式技能证据时展示建议；“完成训练”只是记录行为，不会立即制造能力提升。通过“开始复测”进入关联面试，并在新报告后查看实际聚合结果。没有建议时展示真实空态。
7. 使用 `/interviews` 查看记录，重新打开报告，证明持久化而非只存在于当前浏览器内存。

当前不存在独立的 `/dashboard`、`/skills`、`/jobs` 页面路由；不要按旧设计文档录制这些路径。`/question-bank` 当前会跳回首页，题库管理在 Lab。

### Agent Lab 工程录屏顺序

在 `:5175` 用有实际 ADMIN 权限的账号登录。各工作区通过导航按钮切换，当前没有独立 `/trace`、`/evaluation` URL。

1. “题库治理”：新增合成题目、确认列表回读、按岗位/关键词检索，按需展开参考答案。管理 UI 调用的是 Interview 的 `/api/interview/question-bank`，不是 Agent 私有题库。
2. “运行编排”：选择/创建配置型 Agent，保存固定版本草稿，核对适配器与预算，再显式确认并启动草稿测试。
3. 查看真实 Run ID、运行状态、输出与 Trace；解释模型/工作流事件只证明实际记录到的步骤，不证明未观测工具从未执行。
4. “自进化”：配置版本化 Dataset、Case、BUSINESS_ASSERTIONS Evaluator；启动有界评测，查看持久化逐项断言、失败原因、Run 引用与合同哈希。
5. 核验发布门禁，重点展示失败评测不能发布。确定性断言只评价输出合同；当前不能据此宣布开放式面试评分语义准确。

### 题库与组织约束

当前每次用户注册会新建 Organization；题库检索按认证上下文的组织隔离。管理员在 Lab 新增的题目不会自动进入另一个新注册候选人的题库。演示“管理端入库→面试端选题”应使用同一个演示管理员账号登录两端，并匹配选题所需的岗位、级别、分类；不匹配或存储读取失败时，队列可能使用明确标记的本地 fallback，不能称为命中所新增题目。

不要通过修改现有用户组织、共享真实账号凭据或绕过租户过滤来伪造联通。公共题库发布、跨组织授权复制属于另行验收能力，不因 UI 同时可见就成立。

## 隔离合成验收

前提：Docker、Node 20、当前 shell 中的 pnpm 9、已安装 Chromium 依赖。确认 `pnpm --version` 为 9；脚本内部直接调用 `pnpm`，只在外层使用不同 pnpm 版本包装并不改变其内部解析。命令必须在仓库根目录执行，不使用真实业务账号或生产 `.env`。

```bash
pnpm --version
pnpm install --frozen-lockfile
pnpm --filter @interview-agent/web exec playwright install --with-deps chromium
docker build -f apps/api/Dockerfile -t interview-api:verification .
docker build -f apps/web/Dockerfile -t interview-web:verification .
docker build -f apps/agent-lab/Dockerfile -t interview-lab:verification .
FIXTURE_BROWSER_TEST=1 FIXTURE_GOLDEN_PROBE=1 FIXTURE_PRESENTATION_STORE=1 FIXTURE_PRESENTATION_PROBE=1 FIXTURE_LAB_IMAGE=interview-lab:verification FIXTURE_WEB_IMAGE=interview-web:verification bash scripts/ci/verify-built-api.sh interview-api:verification
```

此自动模式使用 headless Playwright，默认执行完整 scope。它会先跑实际 HTTP/PG 检查，然后启动 Lab 浏览器、候选人浏览器和恢复检查；任一前置失败会阻止后续阶段。`FIXTURE_BROWSER_SCOPE=golden` 仅为已有聚焦排查模式，不代表完整 Lab/策略/恢复验收，不用于声称全套通过。

真实 UI/API/PG 合成产品链的脚本是 `apps/web/e2e/golden-interview-loop.mjs`；Lab 脚本是 `apps/web/e2e/lab-isolated-acceptance.mjs`。二者的合成账号由脚本创建，本文不提供真实账号或密码。

### 现有手工 gate 仅能暂停 Lab

在一个全新、尚不存在的 gate 路径上运行；不要预先创建该文件。下面示例的路径仅是本机临时信号，不包含凭据：

```bash
FIXTURE_BROWSER_GATE=/tmp/interview-recording-lab-ready.gate FIXTURE_GOLDEN_PROBE=1 FIXTURE_LAB_IMAGE=interview-lab:verification FIXTURE_WEB_IMAGE=interview-web:verification bash scripts/ci/verify-built-api.sh interview-api:verification
```

不要同时设置 `FIXTURE_BROWSER_TEST=1`，否则会走自动测试而不等待此 gate。等终端出现 `BROWSER FIXTURE READY at http://localhost:5176; waiting for local gate file` 后，才手动打开 Lab。前置 HTTP 检查已创建的合成管理员身份见 `scripts/ci/verify-built-api.mjs`；登录资料只能用于这一临时隔离环境。

手工操作结束后，在另一个终端释放：

```bash
touch /tmp/interview-recording-lab-ready.gate
```

脚本最多等待 900 秒。释放后会立即移除 Lab 容器，再启动候选人 `:5177` 执行自动浏览器检查，然后移除候选人容器并继续恢复验收；没有第二个手工暂停点。因此不能用这个 gate 声称同时开放两端或完整手工录制 Interview 产品链。gate 模式也不执行完整 Lab Playwright 套件，不能代替上面的自动验收。

结束或失败会触发清理，销毁临时容器、网络和默认临时备份目录。手工操作会改变临时状态，可能影响后续自动断言；应另外重跑全自动命令验收。重复手工运行前删除自己创建的旧 gate 文件；不要复用一个已存在的 gate 而跳过暂停。

## 录制前退出门

- 对最终提交核对 CI 原始日志：基础测试、迁移、镜像、实际 HTTP/PG、Lab/候选人浏览器、恢复检查均需有对应结果。
- 在录屏电脑预演同一版本；先准备合成简历和题目，确认实际选题来源、登录权限、模型与预算状态。
- 开场说明是“真实 Provider 本机演示”还是“隔离合成工程验收”；不要混剪后把合成固定分数描述为真实模型效果。
- 实际演示未完成、人工评分未校准、历史费用未知或目标环境未验收的部分保持未验收，不以本手册作为完成证明。

源码依据：`docker-compose.yml`、`scripts/ci/verify-built-api.sh`、`scripts/ci/verify-built-api.mjs`、`.github/workflows/ci-api.yml`、`apps/web/src/App.tsx`、`HomePage.tsx`、`InterviewPage.tsx`、`TrainingPage.tsx`、`apps/agent-lab/src/main.tsx` 及上述浏览器脚本。
