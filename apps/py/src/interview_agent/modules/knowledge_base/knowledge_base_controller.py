"""Knowledge Base Controller — 与 NestJS knowledge-base.controller.ts 像素级对齐。

路由：
- GET  /api/knowledge-base/recall      — RAG 召回调试（?q=&debug=true）
- POST /api/knowledge-base/benchmark  — 召回基准测试
"""
import logging
from typing import Any

from fastapi import APIRouter, HTTPException
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


@router.get("/recall")
async def recall(q: str, debug: bool = False, top_k: int = 5) -> dict:
    """RAG 召回调试。

    ?q=LangGraph%20HITL&debug=true&top_k=5
    """
    if not q:
        raise HTTPException(status_code=400, detail="Query 'q' is required")
    index = _get_index()
    results = index.retrieve(q, top_k=top_k)

    # 同时调 recall_questions（关键词版本）作对比
    kw_results = recall_questions(q, top_k=top_k)

    response = {
        "query": q,
        "topK": top_k,
        "bm25Results": results,
        "keywordResults": kw_results,
        "count": len(results),
    }
    if debug:
        response["debug"] = {
            "indexSize": len(index._docs),
            "domains": list_all_domains(),
        }
    return response


class BenchmarkRequest(BaseModel):
    cases: list[dict[str, Any]]


@router.post("/benchmark")
async def benchmark(req: BenchmarkRequest, limit: int = 5, threshold: float = 0.0) -> dict:
    """召回基准测试。

    Body: {"cases": [{"query": "...", "expected_ids": ["q1"]}]}
    """
    index = _get_index()
    # 转换 cases 格式（NestJS 用 query 字段，Python 也用 query）
    cases = req.cases
    metrics = index.benchmark(cases)
    return {
        "metrics": metrics,
        "caseCount": len(cases),
    }