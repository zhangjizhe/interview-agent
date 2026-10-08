# 当前任务

最后更新：2026-10-08

## 任务 ID

LAB-AUTH-PROXY-1

## 目标与范围

修复用户报告的本机 Agent Lab 登录失败，仅调整 Lab nginx 的 API 地址解析；不修改账号、权限、数据库或模型调用。

## 状态与验收

已完成本地修复与部署。Lab 静态 proxy_pass 缓存 API 容器旧地址，API 重建后登录/注册请求返回 502。复用 Interview 的 Docker resolver 与变量 proxy_pass，保留完整请求 URI。Lab 镜像 tsc/Vite build、源代码严格 lint、容器 nginx -t 通过；实际 Lab readiness 从 502 恢复 200，空凭据 POST /api/auth/login 返回后端结构化 400。未获取用户密码或验证用户实际账号登录；用户刷新后重试确认。无数据库、API 合同、权限或模型费用变化；无需 AI Benchmark。历史 Provider 探针已移除，真实评测预算及发布边界保持见 CURRENT_STATE。
