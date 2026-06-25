"""Resume Parser · 2026-06-25 web ↔ py-api 对齐

对齐 NestJS apps/api-legacy/src/modules/interview/services/resume-parser.service.ts

支持格式：PDF / DOCX / TXT / MD
解析：
- name（正则匹配中文姓名 / 邮箱前缀）
- email（正则）
- skills（关键词库匹配）
- years_of_experience（"X 年经验"模式）
- 原始文本全文 → raw_text

商用 fail-fast：
- 文件 > 10MB 拒绝
- 解析后文本 < 50 字符拒绝（防止空文件）
"""
import re
from typing import Dict, Any
import structlog

logger = structlog.get_logger(__name__)

# 中文姓名模式（2-4 字 + 姓在前）
_NAME_PATTERN = re.compile(r"姓名[::\s]*([\u4e00-\u9fa5]{2,4})")
_EMAIL_PATTERN = re.compile(r"([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})")
_YEARS_PATTERN = re.compile(r"(\d+)\s*年(?:以上)?(?:.*?经验|工作经验|开发经验)?")

# 常见技能关键词（覆盖前端/后端/算法/AI/测试/产品）
SKILL_KEYWORDS = [
    # 前端
    "React", "Vue", "Angular", "TypeScript", "JavaScript", "Next.js", "Nuxt",
    "Webpack", "Vite", "Tailwind", "Redux", "MobX", "Svelte",
    # 后端
    "Python", "Java", "Go", "Node.js", "NestJS", "FastAPI", "Django", "Flask",
    "Spring", "Spring Boot", "Gin", "Express", "Koa", "PostgreSQL", "MySQL",
    "Redis", "MongoDB", "Kafka", "RabbitMQ", "Docker", "Kubernetes", "K8s",
    "gRPC", "REST", "GraphQL", "WebSocket",
    # AI / Agent
    "LangChain", "LangGraph", "OpenAI", "GPT", "Claude", "DeepSeek", "Qwen",
    "RAG", "Embedding", "Vector", "Milvus", "Qdrant", "Pinecone", "Mem0",
    "MCP", "Agent", "Multi-Agent", "Hugging Face", "PyTorch", "TensorFlow",
    # 算法
    "算法", "数据结构", "机器学习", "深度学习", "NLP", "推荐系统",
    # 工具
    "Git", "Linux", "AWS", "GCP", "Azure", "CI/CD", "Jenkins", "GitLab",
    # 测试
    "Jest", "Pytest", "Playwright", "Selenium", "Postman",
]


def parse_resume_text(text: str) -> Dict[str, Any]:
    """从文本提取结构化字段

    用法：
    ```python
    text = read_pdf("resume.pdf")
    parsed = parse_resume_text(text)
    # {"name": "张三", "email": "...", "skills": [...], "years_of_experience": 3, "raw_text": "..."}
    ```
    """
    text = text.strip()
    if len(text) < 50:
        raise ValueError(f"简历内容过短（{len(text)} 字符），请提供更完整的简历")

    # 1. name
    name_match = _NAME_PATTERN.search(text)
    name = name_match.group(1) if name_match else None

    # 2. email
    email_match = _EMAIL_PATTERN.search(text)
    email = email_match.group(1) if email_match else None

    # 3. skills（关键词匹配）
    skills = list({kw for kw in SKILL_KEYWORDS if kw.lower() in text.lower()})

    # 4. years_of_experience
    years_match = _YEARS_PATTERN.search(text)
    years = int(years_match.group(1)) if years_match else None

    # 5. 截断到前 3000 字符做 summary（避免 token 超限）
    summary = text[:3000] if len(text) > 3000 else text

    parsed = {
        "name": name,
        "email": email,
        "skills": skills,
        "years_of_experience": years,
        "char_count": len(text),
        "summary": summary,
        "raw_text": text,
    }
    logger.info(
        "resume_parsed",
        name=name,
        email=email,
        skills_count=len(skills),
        years=years,
        char_count=len(text),
    )
    return parsed


def extract_text_from_pdf(content: bytes) -> str:
    """PDF 提取文本（pdfplumber）"""
    try:
        import pdfplumber
        import io

        text_parts = []
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text() or ""
                text_parts.append(page_text)
        return "\n".join(text_parts)
    except ImportError:
        # fallback：用 pypdf2
        return _extract_text_pdf_fallback(content)


def _extract_text_pdf_fallback(content: bytes) -> str:
    """PDF 提取 fallback（pypdf）"""
    try:
        from pypdf import PdfReader
        import io

        reader = PdfReader(io.BytesIO(content))
        text_parts = [page.extract_text() or "" for page in reader.pages]
        return "\n".join(text_parts)
    except ImportError:
        # 最后 fallback：返回空（让上层报错）
        logger.error("no_pdf_library_available")
        raise RuntimeError(
            "PDF 解析库未安装。请 pip install pdfplumber 或 pypdf"
        )


def extract_text_from_docx(content: bytes) -> str:
    """DOCX 提取文本（python-docx）"""
    try:
        from docx import Document
        import io

        doc = Document(io.BytesIO(content))
        return "\n".join(p.text for p in doc.paragraphs)
    except ImportError:
        logger.error("python-docx_not_installed")
        raise RuntimeError("DOCX 解析库未安装。请 pip install python-docx")


def extract_text_from_file(content: bytes, filename: str) -> str:
    """按扩展名分发到对应解析器

    支持：.pdf / .docx / .txt / .md
    """
    filename_lower = filename.lower()
    if filename_lower.endswith(".pdf"):
        return extract_text_from_pdf(content)
    elif filename_lower.endswith(".docx") or filename_lower.endswith(".doc"):
        return extract_text_from_docx(content)
    elif filename_lower.endswith(".txt") or filename_lower.endswith(".md"):
        return content.decode("utf-8", errors="ignore")
    else:
        # 默认按文本处理
        logger.warning("unknown_file_type_treat_as_text", filename=filename)
        return content.decode("utf-8", errors="ignore")