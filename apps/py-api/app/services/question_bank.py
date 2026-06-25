"""Question Bank · 2026-06-25 web ↔ py-api 对齐

对齐 NestJS apps/api-legacy/src/modules/interview/knowledge-banks/

按岗位（position）从预置题库选 5 道标准题 + 基于简历生成 3 道个性化题。

题库来源：apps/api-legacy/knowledge-base.json（142 items）
按 topic 分桶：frontend / backend / ai-agent / algorithm / test / product

商用简化：
- MVP 用本地静态题库（不接 Milvus 语义检索）
- 个性化题用 Qwen 生成（prompt 在 resume_parser.py 复用）
"""
from typing import List, Dict, Any
from pathlib import Path
import json
import structlog

logger = structlog.get_logger(__name__)

# 题库路径（2026-06-25：复制到 apps/py-api/knowledge-base/knowledge-base.json）
# __file__ = apps/py-api/app/services/question_bank.py
# 3 层 parent = apps/py-api/
KB_PATH = Path(__file__).parent.parent.parent / "knowledge-base" / "knowledge-base.json"


def _load_kb() -> List[Dict[str, Any]]:
    """加载题库（142 items，懒加载）"""
    if not _load_kb._cache:
        try:
            with open(KB_PATH, "r", encoding="utf-8") as f:
                _load_kb._cache = json.load(f)
        except FileNotFoundError:
            logger.warning("kb_not_found", path=str(KB_PATH))
            _load_kb._cache = []
    return _load_kb._cache


_load_kb._cache = []  # type: ignore


def match_bank(position: str) -> str:
    """按岗位匹配题库 topic（2026-06-25 改：KB topic 是中文分类，不是 bank key）

    候选 topics:
    - "Agent 基础架构..." → AI Agent / LLM 岗位
    - "RAG 检索增强..." → RAG / 检索岗位
    - "大模型工程..." → 大模型算法
    - "工具调用 & MCP 协议..." → 工具 / MCP
    - "LangGraph 状态机..." → LangGraph
    - "系统设计..." → 系统设计
    """
    position_lower = position.lower()
    if any(kw in position_lower for kw in ["ai", "agent", "llm", "大模型", "langchain", "langgraph"]):
        return "Agent 基础架构（ReAct、记忆、Multi-Agent、规划）"
    elif any(kw in position_lower for kw in ["rag", "检索", "embedding"]):
        return "RAG 检索增强（切片、Embedding、向量库）"
    elif any(kw in position_lower for kw in ["算法", "transformer", "训练"]):
        return "大模型工程（Transformer、训练、量化、MoE、vLLM）"
    elif any(kw in position_lower for kw in ["工具", "mcp", "tool"]):
        return "工具调用 & MCP 协议（Function Call、Skill、A2A）"
    elif any(kw in position_lower for kw in ["前端", "frontend", "react", "vue"]):
        return "系统设计（RAG 系统、客服系统、Code Agent、高并发）"
    elif any(kw in position_lower for kw in ["后端", "backend", "java", "python", "go", "node"]):
        return "系统设计（RAG 系统、客服系统、Code Agent、高并发）"
    return "Agent 基础架构（ReAct、记忆、Multi-Agent、规划）"


def pick_standard_questions(bank: str, count: int = 5) -> List[str]:
    """从题库按 topic 选 count 道标准题

    题库结构：{"items": [{"id":..., "topic":..., "title":..., "body":..., "number":...}]}
    2026-06-25 改：KB 是 dict 含 items 列表，topic 匹配
    """
    kb_dict = _load_kb()
    if not kb_dict:
        logger.warning("kb_empty_return_placeholder", bank=bank)
        return [f"[{bank}] 标准题 {i+1}" for i in range(count)]

    # 兼容：KB 可能是 dict 含 items，也可能是直接 list
    if isinstance(kb_dict, dict):
        items = kb_dict.get("items", [])
    else:
        items = kb_dict

    if not items:
        return [f"[{bank}] 标准题 {i+1}" for i in range(count)]

    # 按 topic 过滤
    candidates = [item for item in items if item.get("topic") == bank]
    if not candidates:
        # fallback 用全库
        candidates = items

    # 按 number 排序，取前 count
    candidates.sort(key=lambda x: x.get("number", 0))
    picked = candidates[:count]

    # 提取 title 作为问题
    return [item.get("title", "") for item in picked if item.get("title")]


def generate_personalized_questions(
    parsed_resume: Dict[str, Any],
    position: str,
    bank: str,
    qwen_provider: Any,
) -> List[Dict[str, str]]:
    """基于简历生成 3 道个性化题（Qwen LLM 调用）

    返回格式：[{"question": "...", "reason": "..."}, ...]

    失败 fallback：返回空 list（UI 显示只有标准题）
    """
    prompt = f"""你是一位资深面试官。请基于候选人的简历，为【{position}】岗位设计 3 道**个性化追问题**。

【候选人简历摘要】
- 姓名：{parsed_resume.get("name") or "未知"}
- 技能：{", ".join((parsed_resume.get("skills") or [])[:10])}
- 经验：{parsed_resume.get("years_of_experience") or "未知"} 年
- 简历摘要（前 500 字）：{parsed_resume.get("summary", "")[:500]}

【要求】
1. 问题必须**直接引用候选人简历中的具体项目/技能/经验**，不能泛泛而谈
2. 难度对标【{bank}】岗位的资深面试题
3. 每道题附 1 句"出题理由"（说为什么针对这个候选人问）

【输出格式（严格 JSON 数组）】
[
  {{"question": "...", "reason": "..."}},
  {{"question": "...", "reason": "..."}},
  {{"question": "...", "reason": "..."}}
]

只输出 JSON 数组，不要其他文字。
"""
    try:
        import json
        from app.core.metrics import record_llm_call
        import time

        start = time.perf_counter()
        raw = ""
        async def _call():
            return await qwen_provider.chat(
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
                max_tokens=1500,
            )
        # 同步调用（在 async 上下文里用 run_until_complete）
        # 实际 NestJS 用 LlmGatewayService.chat 同步
        import asyncio
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
        raw = loop.run_until_complete(_call())
        record_llm_call(
            provider="qwen",
            model=qwen_provider.model_name,
            status="success",
            duration_seconds=time.perf_counter() - start,
        )

        # 提取 JSON（兼容 ```json ... ``` 包裹）
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        questions = json.loads(raw)
        logger.info("personalized_questions_generated", count=len(questions))
        return questions[:3]
    except Exception as e:
        logger.warning("personalized_questions_failed", error=str(e))
        return []