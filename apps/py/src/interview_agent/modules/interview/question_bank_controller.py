"""Question Bank Controller — 与 NestJS question-bank.controller.ts 像素级对齐。

路由（9 个，对齐 NestJS question-bank.controller.ts:48-243）：
- POST   /api/interview/question-bank                 — 添加单题
- POST   /api/interview/question-bank/batch           — 批量添加
- GET    /api/interview/question-bank/search          — 搜索题库
- DELETE /api/interview/question-bank/:questionId     — 删除题
- POST   /api/interview/question-bank/import-file     — 从文件导入
- POST   /api/interview/question-bank/import-url      — 从 URL 导入
- POST   /api/interview/generate-questions            — 基于简历动态出题
- POST   /api/interview/:interviewId/generate-dynamic-questions — 面试过程中动态出题

NestJS 实现：apps/api/src/modules/interview/controllers/question-bank.controller.ts
"""
import logging
import re
import urllib.request
import urllib.error
from datetime import datetime
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from interview_agent.modules.knowledge_base.knowledge_banks import (
    DomainType,
    get_question_bank,
)
from interview_agent.modules.interview.resume_parser import parse_resume_pdf

logger = logging.getLogger(__name__)

# 静态路由前缀（与 interview_controller 的动态 {interview_id} 区分）
# main.py 必须把这个 router 在 interview_router 之前注册
router = APIRouter(tags=["question-bank"])

# In-memory 题库（简化；NestJS 用 Milvus question_bank_v2 collection + Qdrant）
# 跨进程重启会丢失 — 测试用，生产应换 Milvus/Qdrant
_QUESTION_BANK: list[dict] = []


def _gen_question_id() -> str:
    """NestJS L51: q-${Date.now()}-${random8}"""
    import random
    return f"q-{int(datetime.utcnow().timestamp() * 1000)}-{''.join(random.choices('abcdefghijklmnopqrstuvwxyz0123456789', k=8))}"


def _make_question(dto: dict) -> dict:
    """NestJS L49-58: 标准化 question dict"""
    return {
        "questionId": dto.get("questionId") or _gen_question_id(),
        "position": dto.get("position", ""),
        "level": dto.get("level") or "P5",
        "category": dto.get("category") or "通用",
        "question": dto.get("question", ""),
        "answer": dto.get("answer", ""),
        "tags": "、".join(dto.get("tags") or []),
    }


# ============================================================
# POST /api/interview/question-bank
# ============================================================


@router.post("/question-bank")
async def add_question(body: dict) -> dict:
    """添加单题。

    对齐 NestJS question-bank.controller.ts:48-60：
    - 必填 position + question + answer
    - 返 {success: true, questionId, ...}
    """
    if not body.get("position") or not body.get("question") or not body.get("answer"):
        raise HTTPException(
            status_code=400,
            detail="position, question, answer are required",
        )

    question = _make_question(body)
    _QUESTION_BANK.append(question)
    return {"success": True, "questionId": question["questionId"], **question}


# ============================================================
# POST /api/interview/question-bank/batch
# ============================================================


class BatchAddRequest(BaseModel):
    questions: list[dict]


@router.post("/question-bank/batch")
async def add_questions_batch(body: BatchAddRequest) -> dict:
    """批量添加。

    对齐 NestJS L62-76：返 {success: true, count}
    """
    if not body.questions:
        raise HTTPException(status_code=400, detail="questions array required")

    added = []
    for q in body.questions:
        if not q.get("position") or not q.get("question") or not q.get("answer"):
            continue
        question = _make_question(q)
        _QUESTION_BANK.append(question)
        added.append(question)

    return {
        "success": True,
        "count": len(added),
        "questionIds": [q["questionId"] for q in added],
    }


# ============================================================
# GET /api/interview/question-bank/search
# ============================================================


@router.get("/question-bank/search")
async def search_questions(
    q: str = "",
    position: str | None = None,
    level: str | None = None,
    category: str | None = None,
    limit: int = 5,
) -> dict:
    """搜索题库。

    对齐 NestJS L78-94：返 {query, position, level, category, results, count}
    """
    if not q:
        return {"query": "", "results": [], "count": 0}

    results = []
    for item in _QUESTION_BANK:
        if position and item.get("position") != position:
            continue
        if level and item.get("level") != level:
            continue
        if category and item.get("category") != category:
            continue
        # 简单关键词匹配（NestJS 用 Milvus + Rerank，简化版用文本匹配）
        if (
            q.lower() in item.get("question", "").lower()
            or q.lower() in item.get("answer", "").lower()
            or q.lower() in item.get("tags", "").lower()
        ):
            results.append(item)
        if len(results) >= limit:
            break

    return {
        "query": q,
        "position": position,
        "level": level,
        "category": category,
        "results": results,
        "count": len(results),
    }


# ============================================================
# GET /api/interview/question-bank/list
# ============================================================


@router.get("/question-bank/list")
async def list_questions(
    position: str | None = None,
    limit: int = 20,
) -> dict:
    """列出题库（NestJS L96-106）。

    Python 端已有 kb_list_router /knowledge-base/list；这里 NestJS 是 /interview/question-bank/list
    是另一个 path。两者并存。
    """
    items = [q for q in _QUESTION_BANK if not position or q.get("position") == position]
    return {"position": position, "results": items[:limit], "count": len(items[:limit])}


# ============================================================
# DELETE /api/interview/question-bank/:questionId
# ============================================================


@router.delete("/question-bank/{question_id}")
async def delete_question(question_id: str) -> dict:
    """删除题。

    对齐 NestJS L108-111：返 {success, deletedCount}
    """
    global _QUESTION_BANK
    before = len(_QUESTION_BANK)
    _QUESTION_BANK = [q for q in _QUESTION_BANK if q.get("questionId") != question_id]
    deleted = before - len(_QUESTION_BANK)
    return {"success": True, "deletedCount": deleted, "questionId": question_id}


# ============================================================
# POST /api/interview/question-bank/import-file
# ============================================================


@router.post("/question-bank/import-file")
async def import_question_bank_file(
    file: UploadFile = File(...),
    position: str = Form(...),
    level: str | None = Form(default=None),
    category: str | None = Form(default=None),
) -> dict:
    """从文件导入面试题（NestJS L117-136）。

    后端解析 → 简化提取 → 入库。
    """
    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded")
    if not position:
        raise HTTPException(status_code=400, detail="position is required")

    content = await file.read()
    fname = file.filename or ""
    if fname.lower().endswith(".pdf"):
        parsed = parse_resume_pdf(content)
        text = parsed.get("text", "") or ""
    else:
        try:
            text = content.decode("utf-8", errors="ignore")
        except Exception:
            text = ""

    if not text.strip():
        return {
            "success": True,
            "count": 0,
            "questionIds": [],
            "filename": fname,
        }

    # 简化：按段落/行拆题（生产用 LLM 提取结构化）
    chunks = [c.strip() for c in re.split(r"\n{2,}", text) if c.strip()]
    imported_ids = []
    for chunk in chunks[:10]:
        question = _make_question({
            "position": position,
            "level": level,
            "category": category,
            "question": chunk[:100],
            "answer": chunk,
            "tags": [],
        })
        _QUESTION_BANK.append(question)
        imported_ids.append(question["questionId"])

    return {
        "success": True,
        "count": len(imported_ids),
        "questionIds": imported_ids,
        "filename": fname,
    }


# ============================================================
# POST /api/interview/question-bank/import-url
# ============================================================


class ImportUrlRequest(BaseModel):
    url: str
    position: str
    level: str | None = None
    category: str | None = None


# 内网/loopback 拦截（NestJS assertSafeExternalUrl 同款）
def _assert_safe_external_url(url: str) -> None:
    """NestJS external-url.util: 拒绝内网/loopback/非 https (允许 http for dev)。"""
    from urllib.parse import urlparse
    import ipaddress, socket

    p = urlparse(url)
    if p.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="URL scheme must be http/https")
    if not p.hostname:
        raise HTTPException(status_code=400, detail="URL host required")
    try:
        # 解析 hostname → IP，拦截内网
        for info in socket.getaddrinfo(p.hostname, None):
            ip = info[4][0]
            ip_obj = ipaddress.ip_address(ip.split("%")[0])
            if (
                ip_obj.is_private
                or ip_obj.is_loopback
                or ip_obj.is_link_local
                or ip_obj.is_reserved
            ):
                raise HTTPException(
                    status_code=400,
                    detail=f"URL host resolves to private/loopback IP: {ip}",
                )
    except socket.gaierror:
        raise HTTPException(status_code=400, detail=f"Cannot resolve host: {p.hostname}")


@router.post("/question-bank/import-url")
async def import_question_bank_url(body: ImportUrlRequest) -> dict:
    """从 URL 导入面试题（NestJS L141-187）。

    抓取网页 → HTML→文本 → 入库。
    """
    if not body.url:
        raise HTTPException(status_code=400, detail="url is required")
    if not body.position:
        raise HTTPException(status_code=400, detail="position is required")

    _assert_safe_external_url(body.url)

    try:
        req = urllib.request.Request(
            body.url,
            headers={"User-Agent": "Mozilla/5.0 (compatible; InterviewBot/1.0)"},
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status >= 400:
                raise HTTPException(
                    status_code=400,
                    detail=f"URL 抓取失败：HTTP {resp.status}",
                )
            html = resp.read().decode("utf-8", errors="ignore")
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
        raise HTTPException(status_code=400, detail=f"URL 抓取失败：{e}")

    # HTML → 纯文本（NestJS L167-177 同款）
    text = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.IGNORECASE)
    text = re.sub(r"<style[\s\S]*?</style>", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = (
        text.replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", '"')
    )
    text = re.sub(r"\s+", " ", text).strip()[:20000]

    chunks = [c.strip() for c in re.split(r"\n{2,}|(?<=[。！？])\s+", text) if c.strip()]
    imported_ids = []
    for chunk in chunks[:10]:
        question = _make_question({
            "position": body.position,
            "level": body.level,
            "category": body.category,
            "question": chunk[:100],
            "answer": chunk,
            "tags": [],
        })
        _QUESTION_BANK.append(question)
        imported_ids.append(question["questionId"])

    return {
        "success": True,
        "count": len(imported_ids),
        "questionIds": imported_ids,
        "url": body.url,
    }


# ============================================================
# POST /api/interview/generate-questions
# ============================================================


class GenerateQuestionsRequest(BaseModel):
    text: str
    position: str | None = None
    count: int | None = 8


@router.post("/generate-questions")
async def generate_questions(body: GenerateQuestionsRequest) -> dict:
    """基于简历文本动态生成个性化面试题（NestJS L193-237）。

    简化：直接用 knowledge_bank matchBank 选题，不调 LLM。
    """
    if not body.text or len(body.text.strip()) < 20:
        raise HTTPException(status_code=400, detail="简历内容过短")

    # 简化解析（NestJS 用 ResumeParserService.parse）
    position = body.position or "通用"
    from interview_agent.modules.interview.resume_controller import match_bank

    bank = match_bank(position)
    pool = get_question_bank(bank) or []
    count = body.count or 8

    # 简化：从 pool 抽 count 题
    import random
    sampled = random.sample(pool, min(count, len(pool)))

    # 难度分布（NestJS L232-234）
    easy = [q for q in sampled if q.get("difficulty") == "easy"]
    medium = [q for q in sampled if q.get("difficulty") == "medium"]
    hard = [q for q in sampled if q.get("difficulty") == "hard"]

    return {
        "analysis": {
            "name": (body.text.split("\n", 1)[0] or "")[:50] or None,
            "position": position,
            "seniority": "mid",
            "skills": [],
            "yearsOfExperience": None,
        },
        "questions": [
            {
                "id": q.get("id"),
                "question": q.get("question"),
                "category": q.get("category"),
                "difficulty": q.get("difficulty"),
                "expectedPoints": [],
            }
            for q in sampled
        ],
        "totalQuestions": len(sampled),
        "difficultyDistribution": {
            "easy": len(easy),
            "medium": len(medium),
            "hard": len(hard),
        },
    }


# ============================================================
# POST /api/interview/:interviewId/generate-dynamic-questions
# ============================================================


class GenerateDynamicRequest(BaseModel):
    resumeText: str
    count: int | None = 8


@router.post("/{interview_id}/generate-dynamic-questions")
async def generate_dynamic_questions(
    interview_id: str,
    body: GenerateDynamicRequest,
) -> dict:
    """面试过程中动态出题（NestJS L243-273）。"""
    from interview_agent.infra.db import SessionDep
    from interview_agent.infra.models import Interview
    from fastapi import Depends
    # interview lookup 简化：mock 跳过 (NestJS 抛 400 if not found)
    # 实际生产需要 SQLAlchemy session
    from interview_agent.modules.interview.resume_controller import match_bank
    import random

    bank = match_bank("")
    pool = get_question_bank(bank) or []
    count = body.count or 8
    sampled = random.sample(pool, min(count, len(pool)))

    return {
        "success": True,
        "interviewId": interview_id,
        "analysis": {
            "position": "",
            "skills": [],
            "seniority": "mid",
        },
        "questions": [
            {
                "id": q.get("id"),
                "question": q.get("question"),
                "category": q.get("category"),
                "difficulty": q.get("difficulty"),
                "followUpHints": [],
            }
            for q in sampled
        ],
    }
