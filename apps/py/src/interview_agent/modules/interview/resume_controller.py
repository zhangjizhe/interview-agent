"""Resume Controller — 与 NestJS resume.controller.ts 像素级对齐。

路由（3 个，对齐 NestJS 拆 controller 后的 3 个 endpoint）：
- POST /api/interview/upload-resume         — multipart 上传 + 解析 + Milvus 入库 + 生成个性化题
- GET  /api/interview/resumes/:userId       — 列出用户的简历
- POST /api/interview/parse-resume          — 解析纯文本简历

NestJS 实现：apps/api/src/modules/interview/controllers/resume.controller.ts:42-111
"""
import json
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from interview_agent.modules.interview.rag_service import (
    ResumeRAGService,
    insert_resume_to_pg,
)
from interview_agent.modules.interview.resume_parser import (
    parse_resume_pdf,
)
from interview_agent.modules.knowledge_base.knowledge_banks import (
    DomainType,
    get_question_bank,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["resume"])

# 10MB 限制，对齐 NestJS FileInterceptor limits: { fileSize: 10 * 1024 * 1024 }
MAX_FILE_SIZE = 10 * 1024 * 1024

# R7-fix / R-AUTH-2 B6 (2026-06-28)：upload-resume 校验 MIME 白名单
# 拒绝 text/plain 假装 PDF、application/octet-stream、image/* 等
# 与 NestJS FileFilter (resume.controller.ts:32) 行为对齐
#
# 设计：content_type 必须与文件后缀一致（防 EC-8 假 PDF 通过）
# - .pdf          → application/pdf
# - .md/.markdown → text/markdown / text/x-markdown
# - .txt          → text/plain
ALLOWED_CONTENT_TYPES: set[str] = {
    "application/pdf",
    "text/plain",
    "text/markdown",
    "text/x-markdown",
}

# 文件后缀白名单（与 content_type 互为冗余校验 — NestJS 同款）
ALLOWED_EXTENSIONS: set[str] = {".pdf", ".md", ".markdown", ".txt"}


def _validate_content_type_and_ext(content_type: str, ext: str) -> None:
    """B6 严格校验：content_type 与 ext 必须配对，mime 必须在白名单内。

    Raises:
        HTTPException(415): MIME/Ext 不合法或 mime 与 ext 不匹配
    """
    # 1. 后缀必须在白名单内
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file extension: {ext!r}. "
            f"Only {sorted(ALLOWED_EXTENSIONS)} are supported.",
        )

    # 2. MIME 必须在白名单内
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported content_type: {content_type!r}. "
            f"Only {sorted(ALLOWED_CONTENT_TYPES)} are supported.",
        )

    # 3. MIME 与 ext 必须配对（防 fake.pdf + text/plain 通过）
    expected_mimes: dict[str, set[str]] = {
        ".pdf": {"application/pdf"},
        ".md": {"text/markdown", "text/x-markdown"},
        ".markdown": {"text/markdown", "text/x-markdown"},
        ".txt": {"text/plain"},
    }
    expected = expected_mimes.get(ext, set())
    if content_type not in expected:
        raise HTTPException(
            status_code=415,
            detail=f"Content-Type {content_type!r} does not match extension "
            f"{ext!r}. Expected one of {sorted(expected)}.",
        )


# ============================================================
# Domain matcher（对齐 NestJS matchBank 优先级）
# test > frontend > backend > algo > agent
# ============================================================


def match_bank(position: str) -> DomainType:
    """NestJS matchBank: 测试 > 前端 > 后端 > 算法 > 默认 agent。"""
    p = (position or "").lower()
    if any(k in p for k in ["测试", "qa", "test", "sdet", "质量"]):
        return "test"
    if any(k in p for k in ["前端", "frontend", "react", "vue"]):
        return "frontend"
    if any(
        k in p
        for k in ["后端", "backend", "服务端", "java", "go", "python", "node"]
    ):
        return "backend"
    if any(
        k in p
        for k in ["算法", "algorithm", "机器学习", "nlp", "cv", "视觉"]
    ):
        return "algo"
    return "agent"


def pick_questions(bank: DomainType, count: int = 5) -> list[dict]:
    """NestJS pickQuestions：2 易 + 2 中 + 1 硬 → 共 5 题。

    Python 端 difficulty 字段是 medium/easy/hard，level 用 easy/medium/hard。
    """
    pool = get_question_bank(bank) or []
    easy = [q for q in pool if q.get("difficulty") == "easy"]
    medium = [q for q in pool if q.get("difficulty") == "medium"]
    hard = [q for q in pool if q.get("difficulty") == "hard"]

    import random

    def _pick(arr: list[dict], n: int) -> list[dict]:
        return random.sample(arr, min(n, len(arr)))

    out = _pick(easy, 2) + _pick(medium, 2) + _pick(hard, 1)
    return out[:count]


def _to_parsed_resume(parsed_pdf: dict, position: str) -> dict:
    """把 parse_resume_pdf 的 {text, skills, pageCount} 转成 NestJS ParsedResume 字段。

    NestJS ParsedResume 字段：
    name / email / position / yearsOfExperience / skills / education /
    experience / projects / keywords / seniority / summary
    """
    text = parsed_pdf.get("text", "") or ""
    skills = parsed_pdf.get("skills", []) or []

    # 简化提取（NestJS ResumeParserService 内部实现更复杂，Python 端 mock 提取）
    lines = [ln.strip() for ln in text.split("\n") if ln.strip()]
    name = lines[0] if lines else None

    return {
        "name": name,
        "email": None,
        "position": position,
        "yearsOfExperience": None,
        "skills": skills,
        "education": [],
        "experience": [],
        "projects": [],
        "keywords": skills[:10],
        "seniority": "mid",
        "summary": text[:300] if text else None,
        # 内部用字段
        "_pageCount": parsed_pdf.get("pageCount", 0),
        "_fullText": text,
    }


async def _generate_personalized_questions(
    parsed: dict,
    position: str,
    bank: DomainType,
    userId: str | None,
) -> list[dict]:
    """NestJS resume.controller.ts:116-163 私有方法 generateQuestionsFromResume。

    调 LLM 生成 3 道个性化追问题（1 易 + 1 中 + 1 硬）。
    Python 端用 LLM Gateway（Mock 降级时返空）。
    """
    prompt = (
        f"你是一位资深面试官。请基于候选人的简历，为【{position}】岗位"
        f"设计 3 道**个性化追问题**。\n\n"
        f"【候选人简历摘要】\n"
        f"- 姓名：{parsed.get('name') or '未知'}\n"
        f"- 技能：{'、'.join((parsed.get('skills') or [])[:10])}\n"
        f"- 最近经历：{'；'.join((parsed.get('experience') or [])[:2])}\n"
        f"- 项目：{'、'.join((parsed.get('projects') or [])[:2])}\n\n"
        f"【要求】\n"
        f"1. 题目必须**针对简历中提到的具体技术栈或项目**\n"
        f"2. 每题配一个 reason（为什么针对他问）\n"
        f"3. 难度：1 易 + 1 中 + 1 硬\n\n"
        f"【输出 JSON】\n```json\n"
        '{"questions": [{"question": "...", "reason": "因为候选人提到了 X 技术"}]}\n```'
    )

    try:
        from interview_agent.modules.llm.llm_gateway import get_gateway
        from interview_agent.modules.llm.providers.types import (
            ChatMessage,
            ChatParams,
        )

        gateway = get_gateway()
        params = ChatParams(
            messages=[
                ChatMessage(role="system", content="你是一个严格的面试官。"),
                ChatMessage(role="user", content=prompt),
            ],
            temperature=0.7,
        )
        res = await gateway.chat(params, primary="qwen")
        # 提取 JSON
        match = (res.content or "").replace("```json", "").replace("```", "")
        # 找到第一个 { 开始
        start = match.find("{")
        if start < 0:
            return []
        data = json.loads(match[start:])
        return data.get("questions") or []
    except Exception as e:
        logger.debug(f"personalized questions generation failed: {e}")
        return []


# ============================================================
# POST /api/interview/upload-resume
# ============================================================


@router.post("/upload-resume")
async def upload_resume(
    file: UploadFile = File(...),
    position: str = Form(...),
    userId: str | None = Form(default=None),
) -> dict:
    """简历上传 + 解析 + 入库 + 生成个性化题。

    对齐 NestJS resume.controller.ts:42-78：
    1. 校验 file / position
    2. resumeParser.parse(file, position) → ParsedResume
    3. resumeRag.ingestResume(userId, position, parsed)  (失败不阻塞)
    4. matchBank(position) → BankKey
    5. pickQuestions(bank, 5) → standardQuestions
    6. generateQuestionsFromResume(...) → personalizedQuestions
    7. 返 {parsed, bank, standardQuestions, personalizedQuestions,
          totalQuestions, ragIngested}
    """
    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded")
    if not position:
        raise HTTPException(status_code=400, detail="position is required")

    # R7-fix / R-AUTH-2 B6 (2026-06-28)：校验 MIME 白名单 + ext 一致性
    # 之前只检查文件后缀 .endswith(".pdf")，text/plain 假 PDF 通过污染 RAG
    content_type = (file.content_type or "").split(";")[0].strip().lower()
    fname = file.filename or ""
    ext = "." + fname.rsplit(".", 1)[-1].lower() if "." in fname else ""

    _validate_content_type_and_ext(content_type, ext)

    # 1. 读文件 + 大小校验
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large (>10MB)")
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    # 2. 解析简历（按文件类型）
    if fname.lower().endswith(".pdf") or content_type == "application/pdf":
        parsed_pdf = parse_resume_pdf(content)
    else:
        # TXT/MD/DOC/DOCX: 简化按文本处理（NestJS 用 pdfjs + mammoth 处理其他格式）
        try:
            text = content.decode("utf-8", errors="ignore")
        except Exception:
            text = ""
        parsed_pdf = {
            "text": text,
            "skills": [],
            "pageCount": 1,
            "metadataStripped": True,
        }

    parsed = _to_parsed_resume(parsed_pdf, position)

    # 3. 写 PG resumes 表（source of truth） — R7-fix / R-AUTH-2 治本方案 B
    # PG 写成功 = 上传成功；Mem0 失败只 warn log，不阻塞响应
    rag_ingested = False
    resume_id: str | None = None
    if userId:
        try:
            # 简化存储路径（demo / 本地）：直接用 userId + 文件名（生产用 S3 URL）
            storage_path = f"uploads/{userId}/{fname}"
            resume_id = await insert_resume_to_pg(
                user_id=userId,
                position=position,
                file_name=fname,
                file_path=storage_path,
                file_size=len(content),
                content_type=content_type or "application/pdf",
                parsed_text=parsed_pdf.get("text"),
                parsed_skills=parsed.get("skills") or [],
                parsed_json=parsed,
            )
            rag_ingested = True
        except Exception as e:
            logger.error(f"[resume] PG insert failed: {e}")
            # PG 失败时继续尝试 Mem0 兜底，但 frontend 会拿到 ragIngested=false
            rag_ingested = False

        # 4. 备选：写 Mem0 / L3 长期记忆（语义检索备用，PG 是 source of truth）
        # ⚠️ 失败不阻塞：Mem0 quota 1000/1000 时常见失败，PG 已写就算成功
        try:
            ingested_at = datetime.now(timezone.utc).isoformat()
            skills_str = "、".join(parsed.get("skills") or [])
            from interview_agent.modules.memory.memory import l3_write
            await l3_write(
                userId,
                key=f"resume:{ingested_at}",
                value={
                    "name": parsed.get("name"),
                    "skills": skills_str,  # string, not array
                    "summary": parsed.get("summary"),
                    "position": position,
                    "createdAt": ingested_at,
                },
            )
        except Exception as e:
            logger.warning(f"[resume] Mem0/L3 backup write skipped: {e}")

    # 4. 匹配知识库
    bank = match_bank(position)

    # 5. 标准题（5 题：2 易 + 2 中 + 1 硬）
    standard_questions = pick_questions(bank, 5)

    # 6. 个性化题（基于简历生成 3 道）
    personalized_questions = await _generate_personalized_questions(
        parsed, position, bank, userId
    )

    return {
        "parsed": {
            "name": parsed.get("name"),
            "email": parsed.get("email"),
            "position": parsed.get("position"),
            "yearsOfExperience": parsed.get("yearsOfExperience"),
            "skills": parsed.get("skills"),
            "education": parsed.get("education"),
            "experience": parsed.get("experience"),
            "projects": parsed.get("projects"),
            "keywords": parsed.get("keywords"),
            "seniority": parsed.get("seniority"),
            "summary": parsed.get("summary"),
        },
        "bank": bank,
        "standardQuestions": standard_questions,
        "personalizedQuestions": personalized_questions,
        "totalQuestions": len(standard_questions) + len(personalized_questions),
        "ragIngested": rag_ingested,
        "resumeId": resume_id,  # R7-fix: 返 PG resume id，前端可用
    }


# ============================================================
# GET /api/interview/resumes/:userId
# ============================================================


@router.get("/resumes/{user_id}")
async def list_user_resumes(user_id: str) -> dict:
    """获取用户的所有简历（按 createdAt 倒序）。

    对齐 NestJS resume.controller.ts:80-86：
    - resumeRag.searchByUser(userId, 10)
    - 返 {userId, resumes, count}
    """
    rag = ResumeRAGService()
    resumes = await rag.search_by_user(user_id, 10)
    return {
        "userId": user_id,
        "resumes": resumes,
        "count": len(resumes),
    }


# ============================================================
# POST /api/interview/parse-resume
# ============================================================


class ParseResumeRequest(BaseModel):
    text: str
    position: str | None = None


@router.post("/parse-resume")
async def parse_resume_text(req: ParseResumeRequest) -> dict:
    """解析纯文本简历。

    对齐 NestJS resume.controller.ts:92-111：
    - text 至少 20 字符
    - resumeParser.parse(text, position)
    - 返 name/email/position/yearsOfExperience/skills/education/
      experience/projects/keywords/seniority/summary
    """
    if not req.text or len(req.text.strip()) < 20:
        raise HTTPException(
            status_code=400, detail="简历内容过短，请提供更完整的文本"
        )

    parsed_pdf = parse_resume_pdf(
        req.text.encode("utf-8") if False else b""  # placeholder
    )
    # 直接用 text 重新构造（不走 PDF 路径）
    parsed_pdf = {
        "text": req.text,
        "skills": [],
        "pageCount": 1,
        "metadataStripped": True,
    }
    parsed = _to_parsed_resume(parsed_pdf, req.position or "")

    return {
        "name": parsed.get("name"),
        "email": parsed.get("email"),
        "position": parsed.get("position"),
        "yearsOfExperience": parsed.get("yearsOfExperience"),
        "skills": parsed.get("skills"),
        "education": parsed.get("education"),
        "experience": parsed.get("experience"),
        "projects": parsed.get("projects"),
        "keywords": parsed.get("keywords"),
        "seniority": parsed.get("seniority"),
        "summary": parsed.get("summary"),
    }
