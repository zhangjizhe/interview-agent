"""RAG 服务 — 与 NestJS rag.service.ts + resume-rag.service.ts 像素级对齐。

混合检索（简化版）：
- Dense 向量（Qwen text-embedding-v3, dim=1024）
- BM25 Sparse（rank_bm25）
- RRF 融合
- CrossEncoder Rerank（无模型时跳过）

实际生产环境用 Milvus hybrid search；这里降级到 in-process BM25 + embedding。
"""
import logging
import math
import re
from collections import Counter
from typing import Any

logger = logging.getLogger(__name__)


def _tokenize(text: str) -> list[str]:
    """简单分词：英文按空格 + 小写，中文按字符。"""
    text = text.lower()
    tokens = re.findall(r"[a-z]+|[\u4e00-\u9fff]", text)
    return tokens


def _bm25_score(
    query_tokens: list[str],
    doc_tokens: list[str],
    idf: dict[str, float],
    avg_dl: float,
    k1: float = 1.5,
    b: float = 0.75,
) -> float:
    """BM25 scoring。"""
    score = 0.0
    doc_tf = Counter(doc_tokens)
    doc_len = len(doc_tokens)
    for qt in query_tokens:
        if qt not in doc_tf:
            continue
        tf = doc_tf[qt]
        idf_val = idf.get(qt, 0)
        numerator = tf * (k1 + 1)
        denominator = tf + k1 * (1 - b + b * doc_len / avg_dl)
        score += idf_val * numerator / denominator
    return score


class RAGService:
    """RAG 混合检索服务（in-process 实现，生产用 Milvus）。"""

    def __init__(self, dim: int = 1024):
        self.dim = dim
        self._docs: list[dict] = []  # [{id, text, tokens, embedding}]
        self._indexed = False

    def add_documents(self, docs: list[dict]) -> None:
        """添加文档到索引。"""
        for d in docs:
            tokens = _tokenize(d.get("text", "") or d.get("question", ""))
            self._docs.append({
                "id": d.get("id", str(len(self._docs))),
                "text": d.get("text", "") or d.get("question", ""),
                "tokens": tokens,
                "embedding": None,  # 真生产环境用 Qwen embedding 预计算
                "metadata": d,
            })
        self._indexed = False

    def _ensure_indexed(self) -> None:
        if self._indexed:
            return
        n = len(self._docs)
        if n == 0:
            return
        # 计算 IDF
        df: Counter[str] = Counter()
        for d in self._docs:
            for t in set(d["tokens"]):
                df[t] += 1
        idf = {t: math.log((n - df_t + 0.5) / (df_t + 0.5) + 1) for t, df_t in df.items()}
        avg_dl = sum(len(d["tokens"]) for d in self._docs) / max(n, 1)
        for d in self._docs:
            d["idf"] = idf
        self._avg_dl = avg_dl
        self._idf = idf
        self._indexed = True

    def retrieve(
        self,
        query: str,
        top_k: int = 5,
        threshold: float = 0.0,
        use_dense: bool = False,
        use_rrf: bool = True,
    ) -> list[dict]:
        """混合检索（简化版）。

        Returns: list of {id, text, score, metadata}
        """
        self._ensure_indexed()
        if not self._docs:
            return []

        query_tokens = _tokenize(query)

        # 1. BM25 检索
        bm25_scores = [
            (d, _bm25_score(query_tokens, d["tokens"], self._idf, self._avg_dl))
            for d in self._docs
        ]
        bm25_scores.sort(key=lambda x: -x[1])
        bm25_top = [(d, s) for d, s in bm25_scores[:top_k * 2] if s > 0]

        # 2. Dense 检索（简化：跳过，因为无 embedding 模型）
        # 真生产用 Qwen embedding + Qdrant

        # 3. RRF 融合（这里只有 BM25 一路，直接返回 top_k）
        results = []
        for rank, (d, score) in enumerate(bm25_top[:top_k]):
            if score < threshold:
                continue
            results.append({
                "id": d["id"],
                "text": d["text"],
                "score": score,
                "rank": rank,
                "metadata": d["metadata"],
            })

        return results

    def benchmark(self, cases: list[dict]) -> dict:
        """基准测试：计算 P@5, MRR, Recall。

        cases: [{"query": "...", "expected_ids": ["q1", "q2"]}, ...]
        """
        if not cases:
            return {"precisionAt5": 0, "meanReciprocalRank": 0, "recall": 0, "count": 0}

        p5_total = 0.0
        mrr_total = 0.0
        recall_total = 0.0

        for case in cases:
            query = case.get("query", "")
            expected = set(case.get("expected_ids", []))
            if not expected:
                continue

            results = self.retrieve(query, top_k=5)
            retrieved_ids = [r["id"] for r in results]

            # P@5
            hits = len(set(retrieved_ids) & expected)
            p5_total += hits / 5

            # MRR
            mrr = 0.0
            for rank, rid in enumerate(retrieved_ids, 1):
                if rid in expected:
                    mrr = 1.0 / rank
                    break
            mrr_total += mrr

            # Recall
            recall_total += hits / len(expected)

        n = len(cases)
        return {
            "precisionAt5": round(p5_total / n, 4),
            "meanReciprocalRank": round(mrr_total / n, 4),
            "recall": round(recall_total / n, 4),
            "count": n,
        }


# ============================================================
# ResumeRAGService — 简历历史 RAG（按 createdAt 倒序）
# R7-fix / R-AUTH-2 治本方案 B (2026-06-28)：
#   PG `resumes` 表作为 source of truth，Mem0 只做备选语义检索
# ============================================================


class ResumeRAGService:
    """候选人简历历史 RAG：按 createdAt 倒序召回最新版本。

    行为对齐 NestJS ResumeRAGService.searchByUser：
    - 按 user_id 查所有简历
    - 按 createdAt DESC 排序
    - 取最新 N 条

    R7-fix / R-AUTH-2 治本方案 B (2026-06-28)：
    - **PG `resumes` 表是 source of truth**（不再依赖 Mem0）
    - 备选：Mem0 语义检索（quota / API 不可用时 skip）
    - 兜底：l3 in-process dict（仅 dev mode，多 worker 不共享）
    """

    async def search_by_user(
        self,
        user_id: str,
        limit: int = 5,
    ) -> list[dict]:
        """按 user_id 召回最新 N 条简历。

        查询顺序（治本）：
        1. **PG `resumes` 表** (source of truth) — 按 userId 过滤，createdAt DESC 排序
        2. Mem0 (备选) — 语义检索（如 PG 失败/为空时）
        3. in-process dict (仅 dev mode 兜底)

        Returns: list of {id, userId, position, fileName, fileSize, contentType,
                          parsedText, parsedSkills, parsedJson, createdAt, updatedAt}
        """
        items = await self._search_by_user_pg(user_id, limit)
        if items:
            return items

        # Mem0 备选（不可用时 except 吃掉）
        try:
            from interview_agent.modules.memory.memory import l3_read
            resumes = await l3_read(user_id, key=None) or {}
            if isinstance(resumes, dict):
                for k, v in resumes.items():
                    if isinstance(v, dict) and "createdAt" in v:
                        items.append(v)
                items.sort(key=lambda x: x.get("createdAt", ""), reverse=True)
                items = items[:limit]
        except Exception as e:
            logger.warning(f"ResumeRAGService Mem0 fallback failed: {e}")

        return items[:limit]

    async def _search_by_user_pg(
        self,
        user_id: str,
        limit: int = 5,
    ) -> list[dict]:
        """PG source of truth: 按 userId 查 resumes 表，按 createdAt DESC 取最新 N 条。

        R7-fix / R-AUTH-2 治本方案 B — 替换原 Mem0 路径。
        """
        from interview_agent.infra.models import Resume
        from interview_agent.infra.db import async_session_factory
        from sqlalchemy import select

        try:
            async with async_session_factory() as session:
                stmt = (
                    select(Resume)
                    .where(Resume.user_id == user_id)
                    .order_by(Resume.created_at.desc())
                    .limit(limit)
                )
                result = await session.execute(stmt)
                rows = list(result.scalars().all())
                return [
                    {
                        "id": r.id,
                        "userId": r.user_id,
                        "position": r.position,
                        "fileName": r.file_name,
                        "fileSize": r.file_size,
                        "contentType": r.content_type,
                        "parsedText": r.parsed_text,
                        "parsedSkills": r.parsed_skills or [],
                        "parsedJson": r.parsed_json or {},
                        "qdrantPointId": r.qdrant_point_id,
                        "createdAt": r.created_at.isoformat() if r.created_at else None,
                        "updatedAt": r.updated_at.isoformat() if r.updated_at else None,
                        # 兼容旧字段（upload 阶段用 skill 字符串、name 等）
                        "name": (r.parsed_json or {}).get("name") if r.parsed_json else None,
                        "skills": "、".join(r.parsed_skills or []),
                        "summary": (r.parsed_json or {}).get("summary")
                        if r.parsed_json
                        else None,
                    }
                    for r in rows
                ]
        except Exception as e:
            logger.warning(f"ResumeRAGService PG query failed: {e}")
            return []


# ============================================================
# 工具函数（供 upload_resume 调用，写 PG resumes 表）
# ============================================================


async def insert_resume_to_pg(
    user_id: str,
    position: str,
    file_name: str,
    file_path: str,
    file_size: int,
    content_type: str,
    parsed_text: str | None,
    parsed_skills: list[str] | None,
    parsed_json: dict | None,
) -> str:
    """写 PG resumes 表（source of truth）。

    步骤：
    1. Upsert user (auto-create if not exists) — 防 FK 约束违反
       （与 start_interview 的 user upsert 行为对齐）
    2. Insert Resume row

    Returns: 新简历 id (cuid)
    """
    import secrets
    from sqlalchemy import select
    from interview_agent.infra.models import Resume, User
    from interview_agent.infra.db import async_session_factory

    resume_id = f"r{secrets.token_hex(12)}"
    async with async_session_factory() as session:
        # 1. Upsert user (防 FK violation)
        existing = await session.execute(select(User).where(User.id == user_id))
        user = existing.scalar_one_or_none()
        if user is None:
            user = User(
                id=user_id,
                email=f"{user_id}@local",
                name=user_id,
            )
            session.add(user)
            try:
                await session.commit()
            except Exception:
                # email 冲突（race condition）→ 静默忽略，FK 仍能 work
                await session.rollback()

        # 2. Insert Resume row
        row = Resume(
            id=resume_id,
            user_id=user_id,
            position=position,
            file_name=file_name,
            file_path=file_path,
            file_size=file_size,
            content_type=content_type,
            parsed_text=parsed_text,
            parsed_skills=parsed_skills or [],
            parsed_json=parsed_json or {},
        )
        session.add(row)
        await session.commit()
    logger.info(
        f"[resume] inserted PG resume id={resume_id} user={user_id} pos={position}"
    )
    return resume_id
