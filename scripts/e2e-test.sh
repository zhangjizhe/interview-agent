#!/usr/bin/env bash
# Interview Agent 端到端自测
# 覆盖：用户创建 → 简历上传 + Milvus RAG 入库 → 开面试 → 多轮对话
#       → Mem0 语义记忆 → Milvus 简历召回 → 面试报告

set -e

API="http://localhost:3001"
USER_ID="e2e_$(date +%s)"
SESSION_ID=""
PASS=0
FAIL=0

# ---------- helpers ----------
green() { printf "\033[32m%s\033[0m\n" "$1"; }
red() { printf "\033[31m%s\033[0m\n" "$1"; }
yellow() { printf "\033[33m%s\033[0m\n" "$1"; }
banner() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  $1"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

assert_ok() {
  local label="$1"
  local actual="$2"
  local expect="$3"
  if [[ "$actual" == *"$expect"* ]]; then
    green "  ✅ $label"
    PASS=$((PASS+1))
  else
    red "  ❌ $label"
    red "     expected: $expect"
    red "     actual:   $actual"
    FAIL=$((FAIL+1))
  fi
}

# ---------- step 1: user create ----------
banner "Step 1 · 创建用户 $USER_ID"
RESP=$(curl -s -X POST "$API/user" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$USER_ID@test.local\",\"name\":\"测试候选人\"}")
assert_ok "create user" "$RESP" "$USER_ID@test.local"

# ---------- step 2: upload resume + Milvus RAG ingest ----------
banner "Step 2 · 上传简历 + Milvus RAG 入库"

# 写一个临时简历文件
cat > /tmp/test-resume.md <<'EOF'
# 张三

## 联系方式
- Email: zhangsan@example.com
- GitHub: github.com/zhangsan

## 教育背景
- 北京大学 · 计算机科学硕士 · 2020-2024
- 北京大学 · 计算机科学学士 · 2016-2020

## 工作经历
### 字节跳动 · 后端工程师 · 2024.07 - 至今
- 负责推荐系统后端，日均 QPS 50万+
- 使用 Go + gRPC + Kubernetes
- 主导缓存层重构，Redis 命中率从 78% 提升到 95%

### 腾讯 · 后端实习生 · 2023.06 - 2023.09
- 参与微信支付链路优化
- MySQL 主从分离 + 分库分表

## 技术栈
- 语言: Go (主力), Python, TypeScript
- 后端: gRPC, Gin, NestJS
- 数据库: MySQL, Redis, MongoDB, Milvus
- 基础设施: Docker, K8s, Prometheus

## 项目
### 开源: 一个 LLM Agent 框架
- GitHub 1.2k stars
- 支持多模型路由 + SubAgent 编排
- 已发布 npm 包
EOF

RESP=$(curl -s -X POST "$API/interview/upload-resume" \
  -F "file=@/tmp/test-resume.md" \
  -F "position=后端工程师" \
  -F "userId=$USER_ID")
# upload-resume 响应里没 userId，但有 ragIngested:true 表示成功
assert_ok "upload-resume returns ragIngested" "$RESP" '"ragIngested":true'
assert_ok "resume parsed has name" "$RESP" "张三"
assert_ok "resume parsed has skills" "$RESP" "Go"

# ---------- step 3: 等 Milvus 索引刷新 ----------
banner "Step 3 · 等 Milvus 索引刷新"
sleep 3
yellow "  ⏳ 3s"

# ---------- step 4: 简历 RAG 召回 ----------
banner "Step 4 · 简历 RAG 召回（查 userId 历史简历）"
RESP=$(curl -s "$API/interview/resumes/$USER_ID")
assert_ok "resume RAG search returns resumes" "$RESP" "resumes"
yellow "  📋 Response: $(echo "$RESP" | head -c 200)..."

# ---------- step 5: 开面试 ----------
banner "Step 5 · 开面试"
RESP=$(curl -s -X POST "$API/interview/start" \
  -H 'Content-Type: application/json' \
  -d "{\"userId\":\"$USER_ID\",\"position\":\"后端工程师\"}")
SESSION_ID=$(echo "$RESP" | grep -o '"interviewId":"[^"]*"' | head -1 | cut -d'"' -f4)
assert_ok "interview start returns interviewId" "$RESP" "interviewId"
yellow "  📋 sessionId = $SESSION_ID"

# 看实际返回里是不是有 sessionId（兼容老字段）
if [ -z "$SESSION_ID" ]; then
  SESSION_ID=$(echo "$RESP" | grep -o '"sessionId":"[^"]*"' | head -1 | cut -d'"' -f4)
fi

# ---------- step 6: 多轮对话 ----------
banner "Step 6 · 多轮对话（SSE）"

send_msg() {
  local msg="$1"
  local expect="$2"
  yellow "  💬 → $msg"
  RESP=$(curl -s -N -X POST "$API/interview/$SESSION_ID/message" \
    -H 'Content-Type: application/json' \
    -d "{\"userId\":\"$USER_ID\",\"content\":\"$msg\"}")
  assert_ok "  SSE response contains '$expect'" "$RESP" "$expect"
  yellow "  🤖 ← $(echo "$RESP" | head -c 100)..."
}

send_msg "你好，请介绍下你自己" "你好"
send_msg "你之前在字节跳动的推荐系统是怎么做的？" "推荐"
send_msg "你的优势是什么？劣势呢？" "优势"

# ---------- step 7: Mem0 长期记忆 ----------
banner "Step 7 · Mem0 长期记忆召回"
sleep 2  # 等 Mem0 异步提取
RESP=$(curl -s "$API/interview/memories/$USER_ID")
assert_ok "memories endpoint returns" "$RESP" "memories"
yellow "  📋 Memories: $(echo "$RESP" | head -c 300)..."

# ---------- step 8: 结束 + 报告 ----------
banner "Step 8 · 结束面试 + 生成报告"
RESP=$(curl -s -X POST "$API/interview/$SESSION_ID/end" -H 'Content-Type: application/json' -d "{}")
assert_ok "interview end returns" "$RESP" "report"

# ---------- step 9: 拉面试详情 ----------
banner "Step 9 · 拉面试详情"
RESP=$(curl -s "$API/interview/$SESSION_ID")
assert_ok "interview detail has sessionId" "$RESP" "$SESSION_ID"

# ---------- summary ----------
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  📊 Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
green "  ✅ Passed: $PASS"
if [ $FAIL -gt 0 ]; then
  red "  ❌ Failed: $FAIL"
  exit 1
else
  green "  🎉 All e2e tests passed!"
fi