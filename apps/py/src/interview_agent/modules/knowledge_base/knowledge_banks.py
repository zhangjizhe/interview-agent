"""Knowledge Banks — 与 NestJS knowledge-banks/*.bank.ts 像素级对齐。

5 领域题库：agent / algo / backend / frontend / test
"""
import json
import os
from typing import Literal

DomainType = Literal["agent", "algo", "backend", "frontend", "test"]

# 内置题库（与 NestJS knowledge-banks 对齐的最小可工作子集）
_QUESTION_BANKS: dict[str, list[dict]] = {
    "agent": [
        {
            "id": "agent-001",
            "question": "请解释 LangGraph 的 StateGraph 与传统 ReAct Agent 的区别。",
            "category": "AI Agent",
            "difficulty": "medium",
            "tags": ["LangGraph", "Multi-Agent", "StateGraph"],
        },
        {
            "id": "agent-002",
            "question": "HITL 中断审批的实现原理是什么？interrupt 与 Command(resume) 如何配合？",
            "category": "AI Agent",
            "difficulty": "hard",
            "tags": ["LangGraph", "HITL", "interrupt"],
        },
        {
            "id": "agent-003",
            "question": "Specialist Handoffs 模式下，多个 Agent 如何协作？",
            "category": "AI Agent",
            "difficulty": "medium",
            "tags": ["Multi-Agent", "Handoffs"],
        },
    ],
    "algo": [
        {
            "id": "algo-001",
            "question": "给定一个无序数组，找出第 K 大的数。要求时间复杂度 O(n log k)。",
            "category": "Algorithm",
            "difficulty": "medium",
            "tags": ["heap", "sort"],
        },
        {
            "id": "algo-002",
            "question": "如何检测链表中的环？进阶：找出环的入口。",
            "category": "Algorithm",
            "difficulty": "easy",
            "tags": ["linked-list", "two-pointers"],
        },
        {
            "id": "algo-003",
            "question": "最长上升子序列（LIS）的 DP 解法和二分优化解法。",
            "category": "Algorithm",
            "difficulty": "medium",
            "tags": ["DP", "binary-search"],
        },
    ],
    "backend": [
        {
            "id": "backend-001",
            "question": "PostgreSQL 的 MVCC 机制如何实现？",
            "category": "Backend",
            "difficulty": "hard",
            "tags": ["PostgreSQL", "MVCC"],
        },
        {
            "id": "backend-002",
            "question": "Redis 的持久化机制 RDB 与 AOF 的区别与选型。",
            "category": "Backend",
            "difficulty": "medium",
            "tags": ["Redis", "persistence"],
        },
        {
            "id": "backend-003",
            "question": "分布式锁的实现：Redis SETNX vs ZooKeeper vs 数据库唯一索引。",
            "category": "Backend",
            "difficulty": "hard",
            "tags": ["distributed", "lock"],
        },
    ],
    "frontend": [
        {
            "id": "frontend-001",
            "question": "React 18 的 Concurrent Rendering 与 Suspense 的关系？",
            "category": "Frontend",
            "difficulty": "medium",
            "tags": ["React", "Concurrent"],
        },
        {
            "id": "frontend-002",
            "question": "TypeScript 中的协变与逆变，举例说明。",
            "category": "Frontend",
            "difficulty": "hard",
            "tags": ["TypeScript", "types"],
        },
        {
            "id": "frontend-003",
            "question": "虚拟列表的实现原理与性能优化。",
            "category": "Frontend",
            "difficulty": "medium",
            "tags": ["virtual-list", "performance"],
        },
    ],
    "test": [
        {
            "id": "test-001",
            "question": "如何测试一个使用了 SSE 的流式接口？",
            "category": "Test",
            "difficulty": "medium",
            "tags": ["SSE", "testing"],
        },
        {
            "id": "test-002",
            "question": "Playwright 与 Cypress 的差异与选型。",
            "category": "Test",
            "difficulty": "medium",
            "tags": ["Playwright", "Cypress"],
        },
    ],
}


def get_question_bank(domain: DomainType) -> list[dict]:
    """获取某个领域的题库。"""
    return _QUESTION_BANKS.get(domain, [])


def list_all_domains() -> list[str]:
    """列出所有可用领域。"""
    return list(_QUESTION_BANKS.keys())


def get_question_by_id(qid: str) -> dict | None:
    """跨领域查单个题。"""
    for bank in _QUESTION_BANKS.values():
        for q in bank:
            if q["id"] == qid:
                return q
    return None


def recall_questions(
    query: str,
    domain: DomainType | None = None,
    top_k: int = 5,
) -> list[dict]:
    """简化版 RAG 召回：基于关键词匹配的 BM25-like 评分。

    生产环境替换为 Milvus 混合检索（dense + BM25 + RRF + Rerank）。
    """
    q_lower = query.lower()
    candidates: list[tuple[float, dict]] = []

    domains = [domain] if domain else list(_QUESTION_BANKS.keys())
    for d in domains:
        for q in _QUESTION_BANKS.get(d, []):
            score = 0.0
            # 关键词匹配
            for kw in q.get("tags", []) + [q["question"], q.get("category", "")]:
                if kw.lower() in q_lower or q_lower in kw.lower():
                    score += 1.0
            # 难度匹配加分
            if any(kw in q_lower for kw in ["hard", "深入", "进阶"]):
                if q["difficulty"] == "hard":
                    score += 0.5
            if score > 0:
                candidates.append((score, q))

    # 排序 + 取 top_k
    candidates.sort(key=lambda x: -x[0])
    return [q for _, q in candidates[:top_k]]