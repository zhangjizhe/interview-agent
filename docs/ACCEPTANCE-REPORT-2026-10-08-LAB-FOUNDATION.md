# Lab 基础阻断修复验收

日期：2026-10-08；分支：agent-lab；PRODUCT-REACCEPTANCE-1 基础阻断阶段。整体 NOT_ACCEPTED，本报告不是自定义 Agent、编排或全产品交付。

## 复现与修复

- 浏览器题库初始列表返回 ValidationPipe 400：空岗位被发送为 `position=`，违反非空可选字段合同。列表和搜索现在省略空白岗位并正确编码有效输入，保持后端 DTO 限制。
- MCP 重载读取错误被 Registry 包装成 errors，Controller 却返回 ok:true 并写成功审计。现在错误返回拒绝，并记录固定 REJECTED；先全文件校验再修改，失败不部分覆盖。重载保留原 execute 与 systemOverride，连接参数变化要求重启应用，避免旧执行器对应新连接。
- 健康检查原 builtin 恒成功、stdio 未实现却成功、TCP 可达即 running；前端忽略 ok。现在禁用/缺绑定/未验证协议不会成功；builtin 仅验证绑定，不发模型或外部调用。汇总改为“已启用且执行绑定就绪”，明确不代表服务真实可用。前端显示检查失败原因。
- 独立审计曾误判配置路径；重新计算并实际 access 验证后撤回。原 ../../../config 路径正确，没有作不必要修改。

## 证据

| 验证 | 结果及边界 |
| --- | --- |
| 独立测试 Agent Registry 回归 | 8/8；临时配置、失败原子性、执行绑定/关闭保持、诚实健康；无外部请求 |
| API 相关回归 | 6 suites / 42 tests 通过；包括上述8项，不能相加计为50项 |
| Lab 题库组件与参数回归 | 6/6；合成传输不代替真实写入 |
| 类型、构建及 lint | API typecheck、Lab tsc/Vite、双端 Docker build、相关严格 lint 通过；diff check通过 |
| 实际镜像隔离 HTTP | 43/43；internal Docker 网络阻止外网，题库列表真实 Milvus、关闭/health/reload/list读回、角色隔离等 |
| 恢复/故障 | Redis readiness503/liveness200及恢复；25并发readiness通过；PG完整规范化schema/data/sequence转储一致；恢复后的Milvus/etcd与Qdrant数据实际读回 |
| 本机部署与浏览器 | API/Lab镜像已更新，无schema变更；刷新保持登录，题库从错误恢复为正确空状态；禁用GitHub MCP显示未通过检查，而非成功 |

首次镜像新增用例将 `{results,count}` 响应误断言为数组，失败并停止；修正测试合同后整套重跑通过。该失败未记为产品通过。

本机镜像：API manifest list `sha256:9f19fdf4ffd7b337fdaf560cb8e941ce9bc9249eed724211320118743a0124e2`；manifest `sha256:e1c31ab87317f241f0d3d3e58b05ba7eaa1667c04a807960390c46178fead007`。浏览器证据以实际当前页面核对，截图暂存本地未提交，无凭据输出。

## 影响与未完成

无数据库迁移、账号授权或费用账本重置；系统开关仍内存级，重启按配置恢复，运维SOP边界不变。新增 status 输出 executable 字段，并修正 runningCount 语义；消费者仅表示绑定就绪。没有新的付费模型调用，未执行真实质量 Benchmark。

外部 MCP initialize/listTools/callTool、凭据依赖、运行时添加/持久化管理尚未验收。题库新增/语义搜索直接 embedding 与 rerank 的计量边界、超时、分页和删除读回仍需完成。自定义 Agent UI/通用运行适配/工作流编辑执行尚未实现，不把现有 CRUD 或静态图算完成。

下一阶段按 `docs/acceptance/LAB_AGENT_WORKFLOW_CONTRACT.md` 完成 Agent 配置和受控执行，再进入编排和完整双证据验收。遵守 AGENTS 的每Phase完成等待继续；本阶段结果仅可用于修复回归，整体不得交付。
