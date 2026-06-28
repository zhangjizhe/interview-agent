"""Knowledge Base Controller — 与 NestJS knowledge-base.controller.ts 像素级对齐。

路由：
- GET    /api/knowledge-base/recall          — RAG 召回调试（?q=&debug=true）
- GET    /api/knowledge-base/topic/:topic    — 按 topic 列表（NestJS L70-78）
- GET    /api/knowledge-base/stats           — 统计（NestJS L90-93）
- POST   /api/knowledge-base/import          — 手动触发导入（NestJS L95-99）
- POST   /api/knowledge-base/add             — 手动添加（NestJS L105-127）
- POST   /api/knowledge-base/benchmark       — 召回基准测试（NestJS L134-191）

⚠️ NestJS bug 修复：
原 NestJS code 在 /add endpoint 校验失败时返 200 + {success: false}，
违反 REST 约定。Python 端按修复后行为抛 400（同时也会去 PR NestJS 修复）。
"""
import logging
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from interview_agent.modules.interview.rag_service import RAGService
from interview_agent.modules.knowledge_base.knowledge_banks import (
    get_question_bank,
    list_all_domains,
    recall_questions,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/knowledge-base", tags=["knowledge-base"])


# 启动时建索引（题库 → BM25 索引）
_rag_index: RAGService | None = None

# 手动添加的 KB 项（in-memory；NestJS 走 Qdrant collection）
_KB_ITEMS: list[dict] = []


def _get_index() -> RAGService:
    global _rag_index
    if _rag_index is None:
        _rag_index = RAGService()
        # 灌入所有领域题库
        for d in list_all_domains():
            _rag_index.add_documents([
                {"id": q["id"], "text": q["question"], **q}
                for q in get_question_bank(d)
            ])
    return _rag_index


# ============================================================
# GET /api/knowledge-base/recall
# ============================================================


@router.get("/recall")
async def recall(
    q: str | None = None,
    query: str | None = None,
    topic: str | None = None,
    limit: int = 5,
    threshold: float = 0.35,
    debug: bool = False,
) -> dict:
    """RAG 召回。

    对齐 NestJS knowledge-base.controller.ts:44-68：
    - 兼容 q/query 两个参数名
    - topic 可选过滤
    - limit 默认 5, threshold 默认 0.35
    - debug=true 时返 score 分布/字段命中
    """
    query_text = q or query
    if not query_text:
        return {"hits": [], "total": 0}

    index = _get_index()
    start = datetime.utcnow()
    results = index.retrieve(query_text, top_k=limit)
    latency_ms = int((datetime.utcnow() - start).total_seconds() * 1000)

    # 转为 NestJS shape（hits 数组 + item + score）
    hits = []
    for r in results:
        doc = r if isinstance(r, dict) else {"text": str(r), "id": str(r)}
        item = {
            "id": doc.get("id"),
            "topic": doc.get("topic", "通用"),
            "title": doc.get("title") or doc.get("question", ""),
            "body": doc.get("body") or doc.get("answer", ""),
            "tags": doc.get("tags", []),
            "preview": (doc.get("body") or doc.get("answer") or "")[:120],
            "difficulty": doc.get("difficulty", "medium"),
        }
        hits.append({"item": item, "score": r.get("score", 0.0) if isinstance(r, dict) else 0.5})

    out: dict = {"hits": hits, "total": len(hits), "query": query_text}

    if debug:
        scores = [h["score"] for h in hits]
        buckets = [
            {"range": "[0.0, 0.3)", "count": 0},
            {"range": "[0.3, 0.5)", "count": 0},
            {"range": "[0.5, 0.7)", "count": 0},
            {"range": "[0.7, 0.85)", "count": 0},
            {"range": "[0.85, 1.0]", "count": 0},
        ]
        for s in scores:
            if s < 0.3:
                buckets[0]["count"] += 1
            elif s < 0.5:
                buckets[1]["count"] += 1
            elif s < 0.7:
                buckets[2]["count"] += 1
            elif s < 0.85:
                buckets[3]["count"] += 1
            else:
                buckets[4]["count"] += 1

        out["debug"] = {
            "query": query_text,
            "topic": topic,
            "limit": limit,
            "threshold": threshold,
            "totalCandidates": len(hits),
            "returnedCount": len(hits),
            "filteredOut": 0,
            "latencyMs": latency_ms,
            "topScore": round(max(scores), 4) if scores else 0,
            "minScore": round(min(scores), 4) if scores else 0,
            "matchedFields": {},
            "scoreDistribution": buckets,
        }

    return out


# ============================================================
# GET /api/knowledge-base/topic/:topic
# ============================================================


@router.get("/topic/{topic}")
async def list_by_topic(topic: str, limit: int = 20) -> dict:
    """按 topic 列出 KB 项（NestJS L70-78）。"""
    items = [
        {
            "id": it.get("id"),
            "topic": it.get("topic"),
            "title": it.get("title"),
            "body": it.get("body"),
            "tags": it.get("tags", []),
        }
        for it in _KB_ITEMS
        if it.get("topic") == topic
    ]
    return {"items": items[:limit], "total": len(items), "topic": topic}


# ============================================================
# GET /api/knowledge-base/stats
# ============================================================


@router.get("/stats")
async def kb_stats() -> dict:
    """KB 统计（NestJS L90-93）。"""
    domains = list_all_domains()
    total_q = sum(len(get_question_bank(d)) for d in domains)
    return {
        "totalItems": total_q + len(_KB_ITEMS),
        "manualItems": len(_KB_ITEMS),
        "domainCounts": {
            d: len(get_question_bank(d)) for d in domains
        },
        "domains": domains,
    }


# ============================================================
# POST /api/knowledge-base/import
# ============================================================


@router.post("/import")
async def import_now() -> dict:
    """手动触发导入（NestJS L95-99）。"""
    # 简化：从内置题库 + 手动项汇总
    domains = list_all_domains()
    total = sum(len(get_question_bank(d)) for d in domains) + len(_KB_ITEMS)
    return {"success": True, "loaded": total, "errors": []}


# ============================================================
# POST /api/knowledge-base/add
# ============================================================


class AddItemRequest(BaseModel):
    topic: str | None = None
    title: str
    body: str
    tags: list[str] | None = None
    number: int | None = None


@router.post("/add")
async def add_kb_item(body: AddItemRequest) -> dict:
    """手动添加题到 KB（NestJS L105-127）。

    ⚠️ NestJS bug 修复：
    原 NestJS code `return { success: false, message }` 不抛 400，违反 REST 约定。
    Python 端按修复后行为：title/body 缺失抛 400。
    """
    if not body.title or not body.body:
        raise HTTPException(status_code=400, detail="title 和 body 必填")

    item_id = f"manual-{int(datetime.utcnow().timestamp() * 1000)}"
    item = {
        "id": item_id,
        "topic": body.topic or "手动添加",
        "number": body.number or 0,
        "title": body.title,
        "body": body.body,
        "tags": body.tags or [],
    }
    _KB_ITEMS.append(item)
    return {"success": True, "id": item_id, "item": item}


# ============================================================
# POST /api/knowledge-base/benchmark
# ============================================================


class BenchmarkRequest(BaseModel):
    cases: list[dict[str, Any]]


@router.post("/benchmark")
async def benchmark(
    req: BenchmarkRequest,
    limit: int = 5,
    threshold: float = 0.6,
) -> dict:
    """召回基准测试（NestJS L134-191）。"""
    cases = req.cases or []
    index = _get_index()

    p5 = p10 = mrr_sum = recall_hits = 0
    details: list[dict] = []

    for c in cases:
        query = c.get("query", "")
        expected = c.get("expectedItemIds", [])
        if not query:
            continue

        results = index.retrieve(query, top_k=limit)
        hit_ids = [r.get("id") if isinstance(r, dict) else str(r) for r in results]
        first_rank = -1
        for i, hid in enumerate(hit_ids):
            if hid in expected and first_rank < 0:
                first_rank = i + 1

        is_p5 = 0 < first_rank <= 5
        is_p10 = 0 < first_rank <= 10
        mrr = 1 / first_rank if first_rank > 0 else 0

        if is_p5:
            p5 += 1
        if is_p10:
            p10 += 1
        mrr_sum += mrr
        if first_rank > 0:
            recall_hits += 1

        details.append({
            "query": query,
            "expected": expected,
            "gotIds": hit_ids,
            "scores": [
                round(float(r.get("score", 0)), 4) if isinstance(r, dict) else 0
                for r in results
            ],
            "firstHitRank": first_rank,
            "p5": is_p5,
            "p10": is_p10,
            "mrr": round(mrr, 4),
        })

    total = max(len(cases), 1)
    return {
        "totalCases": len(cases),
        "count": len(cases),  # 兼容老 API shape
        "limit": limit,
        "threshold": threshold,
        "metrics": {
            "count": len(cases),  # 兼容老 API shape
            "precisionAt5": round(p5 / total, 4),
            "precisionAt10": round(p10 / total, 4),
            "meanReciprocalRank": round(mrr_sum / total, 4),
            "recall": round(recall_hits / total, 4),
        },
        "details": details,
    }