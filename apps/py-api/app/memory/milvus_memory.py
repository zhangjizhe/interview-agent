"""
4 层记忆架构 L3 上半：Milvus 向量数据库

对齐 NestJS MilvusMemory（@zilliz/milvus2-sdk-node 的 Python 版）

2026-06-26 商用 best practice：
- 结构化日志（structlog）替换 print
- 用 ExternalServiceError 包装错误
"""
from pymilvus import connections, Collection, FieldSchema, CollectionSchema, DataType, utility
from typing import List, Optional
import structlog

from app.shared.escape_milvus import build_milvus_eq

logger = structlog.get_logger(__name__)


class MilvusMemory:
    """Milvus 长期记忆（向量检索）"""

    COLLECTION = "interview_memories"
    VECTOR_DIM = 1024  # 与 Qwen Embedding 一致

    def __init__(self, url: str):
        # 用 urllib.parse.urlparse 替代 split，避免含密码 / 路径 / query 解析错位
        # 例：http://user:pass@milvus:19530 → host="milvus"（不是 "user:pass@milvus"）
        # 例：http://milvus:19530/v1 → port=19530（不是 "19530/v1"）
        from urllib.parse import urlparse
        parsed = urlparse(url)
        self.url = url
        self.host = parsed.hostname or "localhost"
        self.port = parsed.port or 19530
        self.collection: Optional[Collection] = None
        self.connected = False

    async def connect(self):
        """连接 Milvus（同步操作 pymilvus）"""
        try:
            connections.connect("default", host=self.host, port=self.port)
            self.connected = True
            await self.ensure_collection()
        except Exception as e:
            logger.warning("milvus_connect_failed", host=self.host, port=self.port, error=str(e))
            self.connected = False

    async def close(self):
        if self.connected:
            connections.disconnect("default")

    async def ensure_collection(self):
        """确保 collection 存在

        字段顺序必须与 insert() 调用严格一致（pymilvus 按列插入）：
        [id(auto), vector, user_id, content, source, created_at]
        """
        if not self.connected:
            return
        try:
            if not utility.has_collection(self.COLLECTION):
                # 2026-06-26 P1-3 修复：字段顺序显式标注，避免 schema 与 insert 错位
                fields = [
                    FieldSchema(name="id", dtype=DataType.INT64, is_primary=True, auto_id=True),
                    FieldSchema(name="vector", dtype=DataType.FLOAT_VECTOR, dim=self.VECTOR_DIM),
                    FieldSchema(name="user_id", dtype=DataType.VARCHAR, max_length=200),
                    FieldSchema(name="content", dtype=DataType.VARCHAR, max_length=8000),
                    FieldSchema(name="source", dtype=DataType.VARCHAR, max_length=50),
                    FieldSchema(name="created_at", dtype=DataType.VARCHAR, max_length=50),
                ]
                schema = CollectionSchema(fields=fields)
                self.collection = Collection(self.COLLECTION, schema=schema)
                # 建索引
                self.collection.create_index(
                    field_name="vector",
                    index_params={"metric_type": "COSINE", "index_type": "AUTOINDEX"},
                )
                self.collection.load()
            else:
                self.collection = Collection(self.COLLECTION)
                self.collection.load()
        except Exception as e:
            logger.warning("milvus_ensure_collection_failed", collection=self.COLLECTION, error=str(e))

    async def insert_resume(self, user_id: str, position: str, parsed: dict) -> int:
        """把简历写入 Milvus（让 RAG 能召回）

        2026-06-25 web ↔ py-api 对齐：upload-resume 调用
        - 简历 summary 作为 content（截断到 2000 字符，避免超限）
        - source="resume"（区别 conversation）
        - vector：先调 Qwen embedding API（mock 用 0 向量）
        """
        if not self.connected or not self.collection:
            return -1
        # 拼简历 content
        content_parts = [
            f"Position: {position}",
            f"Name: {parsed.get('name') or 'Unknown'}",
            f"Skills: {', '.join(parsed.get('skills') or [])}",
            f"Experience: {parsed.get('years_of_experience') or 'Unknown'} years",
            f"Summary: {(parsed.get('summary') or '')[:2000]}",
        ]
        content = "\n".join(content_parts)
        # TODO: 调 Qwen embedding API（暂用 0 向量，生产前接）
        from app.shared.embeddings import get_embedding
        vector = await get_embedding(content)
        return await self.insert(user_id, content, vector, source="resume")

    async def insert(self, user_id: str, content: str, vector: List[float], source: str = "conversation") -> int:
        """插入一条记忆

        2026-06-26 P1-3 修复：data 列顺序必须与 schema 严格一致：
        schema = [id(auto_id, 不传), vector, user_id, content, source, created_at]
        pymilvus 按列顺序插入，错位会导致 vector 存到 user_id 列等
        """
        if not self.connected or not self.collection:
            return -1
        try:
            from datetime import datetime, timezone
            data = [
                [vector],                                       # vector（schema[1]）
                [user_id],                                      # user_id（schema[2]）
                [content[:8000]],                               # content（schema[3]）
                [source],                                       # source（schema[4]）
                [datetime.now(timezone.utc).isoformat()],      # created_at（schema[5]）
            ]
            result = self.collection.insert(data)
            self.collection.flush()
            logger.info("milvus_insert_ok", user_id=user_id, source=source, content_len=len(content))
            return result.primary_keys[0] if result.primary_keys else -1
        except Exception as e:
            logger.error("milvus_insert_failed", user_id=user_id, error=str(e), error_type=type(e).__name__)
            return -1

    async def search(self, vector: List[float], user_id: str, top_k: int = 5):
        """向量检索

        2026-06-26 P0-1 修复：用 build_milvus_eq 转义 user_id，防止 Milvus filter 表达式注入
        """
        if not self.connected or not self.collection:
            return []
        try:
            results = self.collection.search(
                data=[vector],
                anns_field="vector",
                param={"metric_type": "COSINE"},
                limit=top_k,
                expr=build_milvus_eq("user_id", user_id),
                output_fields=["content", "source", "created_at"],
            )
            hits = []
            for hits_batch in results:
                for hit in hits_batch:
                    hits.append({
                        "id": hit.id,
                        "score": hit.score,
                        "content": hit.entity.get("content"),
                        "source": hit.entity.get("source"),
                        "created_at": hit.entity.get("created_at"),
                    })
            logger.info("milvus_search_ok", user_id=user_id, top_k=top_k, hits=len(hits))
            return hits
        except Exception as e:
            logger.error("milvus_search_failed", user_id=user_id, top_k=top_k, error=str(e))
            return []