---
name: 🐛 Bug 报告
about: 报告一个 bug · 必填复现步骤 + 期望 vs 实际 + 截图
title: '[BUG] '
labels: bug
assignees: zhangjizhe
---

## Bug 描述

<!-- 简洁描述问题 -->

## 复现步骤

1. 
2. 
3. 

## 期望行为

<!-- 你期望发生什么 -->

## 实际行为

<!-- 实际发生了什么 -->

## 截图

<!-- 如果是 UI bug，附截图 -->

## 环境

- **部署方式**：bash deploy.sh / bash deploy.sh --py / 其他
- **后端**：NestJS (3001) / py-api (3002) / 双后端
- **浏览器**：Chrome 120 / Safari 17 / Firefox 119 / 其他
- **OS**：macOS 14 / Windows 11 / Ubuntu 22.04 / 其他
- **Node / Python**：Node 20 / Python 3.11 / 其他
- **项目版本**：commit `git rev-parse --short HEAD` / v0.x.x

## 关键日志

```bash
# docker logs
docker logs interview-api --tail 100 2>&1
docker logs interview-web --tail 50 2>&1
docker logs interview-py-api --tail 100 2>&1

# /api/health/ready
curl -s http://localhost:3001/api/health/ready | jq
```

## 上下文

<!-- 还有别的相关信息吗？比如 LLM API key 错误 / 网络问题 / 性能问题 -->

## 优先级

- [ ] P0 · 阻塞主流程（无法登录 / 无法开始面试 / 数据丢失）
- [ ] P1 · 重要功能故障（某个工具不可用 / 简历解析失败）
- [ ] P2 · 体验问题（UI 显示错位 / 文案错误）
- [ ] P3 · 优化建议（性能 / 体验微调）
