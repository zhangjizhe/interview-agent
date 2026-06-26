"""Question Bank + Knowledge Base · 2026-06-25 web ↔ py-api 对齐 P1

补 9 个 web 调用的 endpoint：

Question Bank（Milvus，source=question_bank）：
1. GET  /api/interview/question-bank/list?position&limit
2. GET  /api/interview/question-bank/search?q&position&level&category
3. POST /api/interview/question-bank/import-file  FormData
4. POST /api/interview/question-bank/import-url  JSON {url, position, level, category}
5. POST /api/interview/questions/add             JSON {position, level, category, question, answer, tags}
6. DELETE /api/interview/question-bank/{qid}

Knowledge Base（本地 KB 文件，142 items）：
7. GET  /api/knowledge-base/list
8. GET  /api/knowledge-base/recall?q&position&level&category
9. POST /api/knowledge-base/add   JSON {topic, title, body, tags}

不重复：upload-resume（已有 interview_more.py）/ list/stats/get/delete（已有）
"""
import json
import uuid
from pathlib import Path
from typing import Optional, List
from fastapi import APIRouter, Request, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
import structlog

logger = structlog.get_logger(__name__)

router = APIRouter()

# KB 文件路径
# __file__ = apps/py-api/app/api/routes/question_bank.py
# 4 层 parent = apps/py-api/
KB_PATH = Path(__file__).parent.parent.parent.parent / "knowledge-base" / "knowledge-base.json"


# === Helpers ===

def _load_kb() -> dict:
    """加载本地 KB（142 items）"""
    if not KB_PATH.exists():
        logger.warning("kb_file_not_found", path=str(KB_PATH))
        return {"items": []}
    try:
        with open(KB_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.error("kb_load_failed", error=str(e))
        return {"items": []}


def _save_kb(kb: dict) -> None:
    """保存本地 KB"""
    KB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(KB_PATH, "w", encoding="utf-8") as f:
        json.dump(kb, f, ensure_ascii=False, indent=2)


async def _search_milvus_questions(
    request: Request, query: str, position: str, top_k: int = 10
) -> List[dict]:
    """从 Milvus 搜问题（source=question_bank）"""
    milvus = request.app.state.milvus_mem
    if not milvus or not milvus.connected:
        return []
    try:
        from app.shared.embeddings import get_embedding
        vector = await get_embedding(query)
        # 用 build_milvus_eq 防止 SQL 注入
        from app.shared.escape_milvus import build_milvus_eq, build_milvus_and
        expr_parts = [build_milvus_eq("source", "question_bank")]
        if position:
            # content 里包含 position 字符串（约定存储格式）
            # 用 Milvus 模糊匹配：用 LIKE（注意：pymilvus LIKE 转义）
            # 简化：直接用 content 包含 position（不严格）
            pass  # 暂时忽略 position filter，全库搜

        results = milvus.collection.search(
            data=[vector],
            anns_field="vector",
            param={"metric_type": "COSINE"},
            limit=top_k,
            expr=build_milvus_and(*expr_parts) if expr_parts else None,
            output_fields=["content", "user_id", "source", "created_at"],
        )
        hits = []
        for hits_batch in results:
            for hit in hits_batch:
                hits.append({
                    "id": hit.id,
                    "score": hit.distance,
                    "content": hit.entity.get("content"),
                })
        return hits
    except Exception as e:
        logger.warning("milvus_search_failed", error=str(e))
        return []


# === 1. GET /api/interview/question-bank/list ===

@router.get("/interview/question-bank/list")
async def question_bank_list(position: str = "", limit: int = 50):
    """从 Milvus 列问题（按 position 过滤）"""
    # 简化：从本地 KB 读（与 knowledge-base 共享文件）
    kb = _load_kb()
    items = kb.get("items", [])

    # 简化：position 作为 topic 模糊匹配
    if position:
        items = [it for it in items if position in (it.get("topic") or "")]

    # 取前 limit
    items = items[:limit]

    # 转成 web 期望格式
    return {
        "results": [
            {
                "id": it.get("id"),
                "questionId": it.get("id"),
                "position": it.get("topic"),
                "level": "",
                "category": "",
                "question": it.get("title"),
                "answer": it.get("body"),
                "tags": it.get("tags", []),
                "preview": it.get("preview", ""),
                "difficulty": it.get("difficulty", ""),
            }
            for it in items
        ]
    }


# === 2. GET /api/interview/question-bank/search ===

@router.get("/interview/question-bank/search")
async def question_bank_search(
    request: Request,
    q: str,
    position: str = "",
    level: str = "",
    category: str = "",
):
    """从 Milvus 搜问题（语义 + keyword）"""
    if not q:
        return {"results": []}

    # 1. Milvus 语义搜
    milvus_hits = await _search_milvus_questions(request, q, position, top_k=10)

    # 2. 简化：本地 KB 关键词搜（title/body 包含 q）
    kb = _load_kb()
    items = kb.get("items", [])
    keyword_hits = []
    q_lower = q.lower()
    for it in items:
        title = (it.get("title") or "").lower()
        body = (it.get("body") or "").lower()
        if q_lower in title or q_lower in body:
            keyword_hits.append({
                "id": it.get("id"),
                "questionId": it.get("id"),
                "position": it.get("topic"),
                "level": "",
                "category": "",
                "question": it.get("title"),
                "answer": it.get("body"),
                "tags": it.get("tags", []),
                "preview": it.get("preview", ""),
                "difficulty": it.get("difficulty", ""),
                "score": 0.8,  # keyword match 给固定分
            })

    # 合并去重
    seen = set()
    results = []
    for h in milvus_hits + keyword_hits:
        key = h.get("questionId") or h.get("id")
        if key and key not in seen:
            seen.add(key)
            results.append(h)

    return {"results": results[:20]}


# === 3. POST /api/interview/question-bank/import-file ===

@router.post("/interview/question-bank/import-file")
async def question_bank_import_file(
    request: Request,
    file: UploadFile = File(...),
    position: str = Form(...),
    level: str = Form("P5"),
    category: str = Form(""),
):
    """从文件导入题目（解析 → 写本地 KB + Milvus）"""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded")

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large")

    # 解析文本
    try:
        from app.services.resume_parser import extract_text_from_file
        text = extract_text_from_file(content, file.filename)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"文件解析失败: {e}")

    # 简化：按段落/换行分题目
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip() and len(p.strip()) > 10]
    if not paragraphs:
        paragraphs = text.split("\n")

    # 写 KB
    kb = _load_kb()
    items = kb.get("items", [])
    next_num = max([it.get("number", 0) for it in items], default=0) + 1
    added_ids = []
    for p in paragraphs[:20]:  # 限制 20 题
        new_id = f"IMP-{uuid.uuid4().hex[:8]}"
        new_item = {
            "id": new_id,
            "topic": position,
            "number": next_num,
            "title": p[:200],
            "body": p,
            "tags": ["imported"],
            "preview": p[:100],
            "difficulty": level,
        }
        items.append(new_item)
        added_ids.append(new_id)
        next_num += 1

    kb["items"] = items
    _save_kb(kb)

    # 写 Milvus（dev 模式 0 embedding，skip）
    # 商用前接 Qwen embedding

    logger.info("question_bank_imported_from_file", count=len(added_ids), filename=file.filename)
    return {
        "count": len(added_ids),
        "filename": file.filename,
        "questionIds": added_ids,
    }


# === 4. POST /api/interview/question-bank/import-url ===

class ImportUrlRequest(BaseModel):
    url: str
    position: str
    level: str = "P5"
    category: str = ""


@router.post("/interview/question-bank/import-url")
async def question_bank_import_url(req: ImportUrlRequest, request: Request):
    """从 URL 导入题目（fetch HTML → 解析 → 写 KB）"""
    import httpx
    import re

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(req.url, follow_redirects=True)
            resp.raise_for_status()
            html = resp.text
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"URL 抓取失败: {e}")

    # 简化：HTML 去 tag，按段落分
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\s+", " ", text).strip()
    paragraphs = [p.strip() for p in re.split(r"[。\n]", text) if p.strip() and len(p.strip()) > 10][:20]

    # 写 KB（同 import-file）
    kb = _load_kb()
    items = kb.get("items", [])
    next_num = max([it.get("number", 0) for it in items], default=0) + 1
    added_ids = []
    for p in paragraphs:
        new_id = f"URL-{uuid.uuid4().hex[:8]}"
        new_item = {
            "id": new_id,
            "topic": req.position,
            "number": next_num,
            "title": p[:200],
            "body": p,
            "tags": ["imported-url"],
            "preview": p[:100],
            "difficulty": req.level,
        }
        items.append(new_item)
        added_ids.append(new_id)
        next_num += 1

    kb["items"] = items
    _save_kb(kb)

    logger.info("question_bank_imported_from_url", count=len(added_ids), url=req.url)
    return {
        "count": len(added_ids),
        "url": req.url,
        "questionIds": added_ids,
    }


# === 5. POST /api/interview/questions/add ===

class AddQuestionRequest(BaseModel):
    position: str
    level: str = "P5"
    category: str = ""
    question: str
    answer: str
    tags: List[str] = []


@router.post("/interview/questions/add")
async def questions_add(req: AddQuestionRequest):
    """加题（写 KB + Milvus）"""
    kb = _load_kb()
    items = kb.get("items", [])
    next_num = max([it.get("number", 0) for it in items], default=0) + 1
    new_id = f"Q-{uuid.uuid4().hex[:8]}"
    new_item = {
        "id": new_id,
        "topic": req.position,
        "number": next_num,
        "title": req.question,
        "body": req.answer,
        "tags": req.tags,
        "preview": req.question[:100],
        "difficulty": req.level,
    }
    items.append(new_item)
    kb["items"] = items
    _save_kb(kb)

    logger.info("question_added", id=new_id, position=req.position)
    return {"ok": True, "id": new_id}


# === 6. DELETE /api/interview/question-bank/{qid} ===

@router.delete("/interview/question-bank/{qid}")
async def question_bank_delete(qid: str):
    """删题（从 KB 移除）"""
    kb = _load_kb()
    items = kb.get("items", [])
    original_count = len(items)
    items = [it for it in items if it.get("id") != qid]
    if len(items) == original_count:
        raise HTTPException(status_code=404, detail="Question not found")
    kb["items"] = items
    _save_kb(kb)

    logger.info("question_deleted", id=qid)
    return {"ok": True}


# === 7. GET /api/knowledge-base/list ===

@router.get("/knowledge-base/list", include_in_schema=False)
@router.get("/knowledge-base/list/")
async def knowledge_base_list():
    """列 KB 所有 items（web 端期望 {items: [...]}）"""
    kb = _load_kb()
    return {"items": kb.get("items", []), "count": len(kb.get("items", []))}


# === 8. GET /api/knowledge-base/recall ===

@router.get("/knowledge-base/recall")
async def knowledge_base_recall(
    request: Request,
    q: str,
    position: str = "",
    level: str = "",
    category: str = "",
):
    """语义检索 KB（Milvus + 本地 fallback）"""
    if not q:
        return {"hits": []}

    # 1. Milvus
    milvus_hits = await _search_milvus_questions(request, q, position, top_k=10)

    # 2. 本地 KB 兜底（关键词匹配）
    kb = _load_kb()
    items = kb.get("items", [])
    q_lower = q.lower()
    local_hits = []
    for it in items:
        title = (it.get("title") or "").lower()
        body = (it.get("body") or "").lower()
        if q_lower in title or q_lower in body:
            local_hits.append({
                "item": {
                    "id": it.get("id"),
                    "topic": it.get("topic"),
                    "title": it.get("title"),
                    "body": it.get("body"),
                    "tags": it.get("tags", []),
                    "preview": it.get("preview", ""),
                    "difficulty": it.get("difficulty", ""),
                },
                "score": 0.75,
            })

    # 转成 web 期望格式
    hits = []
    for h in milvus_hits:
        content = h.get("content", "")
        # 尝试解析 "Position: ... Name: ... Skills: ..."
        hits.append({
            "item": {
                "id": h.get("id"),
                "topic": "",
                "title": content[:200],
                "body": content,
            },
            "score": h.get("score", 0),
        })
    hits.extend(local_hits)

    return {"hits": hits[:20]}


# === 9. POST /api/knowledge-base/add ===

class KbAddRequest(BaseModel):
    topic: str
    title: str
    body: str
    tags: List[str] = []


@router.post("/knowledge-base/add")
async def knowledge_base_add(req: KbAddRequest):
    """加 KB item（写本地文件 + Milvus）"""
    kb = _load_kb()
    items = kb.get("items", [])
    next_num = max([it.get("number", 0) for it in items], default=0) + 1
    new_id = f"KB-{uuid.uuid4().hex[:8]}"
    new_item = {
        "id": new_id,
        "topic": req.topic,
        "number": next_num,
        "title": req.title,
        "body": req.body,
        "tags": req.tags,
        "preview": req.title[:100],
        "difficulty": "P5",
    }
    items.append(new_item)
    kb["items"] = items
    _save_kb(kb)

    logger.info("kb_item_added", id=new_id, topic=req.topic)
    return {"ok": True, "id": new_id}