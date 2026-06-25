"""
4 层记忆架构 L3 上半：Milvus 向量数据库

对齐 NestJS MilvusMemory（@zilliz/milvus2-sdk-node 的 Python 版）
"""
from pymilvus import connections, Collection, FieldSchema, CollectionSchema, DataType, utility
from typing import List, Optional


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
            print(f"[Milvus] Connect failed (will run in degraded mode): {e}")
            self.connected = False

    async def close(self):
        if self.connected:
            connections.disconnect("default")

    async def ensure_collection(self):
        """确保 collection 存在"""
        if not self.connected:
            return
        try:
            if not utility.has_collection(self.COLLECTION):
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
            print(f"[Milvus] ensure_collection failed: {e}")

    async def insert(self, user_id: str, content: str, vector: List[float], source: str = "conversation") -> int:
        """插入一条记忆"""
        if not self.connected or not self.collection:
            return -1
        try:
            from datetime import datetime
            data = [
                [vector],
                [user_id],
                [content[:8000]],
                [source],
                [datetime.utcnow().isoformat()],
            ]
            result = self.collection.insert(data)
            self.collection.flush()
            return result.primary_keys[0] if result.primary_keys else -1
        except Exception as e:
            print(f"[Milvus] insert failed: {e}")
            return -1

    async def search(self, vector: List[float], user_id: str, top_k: int = 5):
        """向量检索"""
        if not self.connected or not self.collection:
            return []
        try:
            results = self.collection.search(
                data=[vector],
                anns_field="vector",
                param={"metric_type": "COSINE"},
                limit=top_k,
                expr=f'user_id == "{user_id}"',
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
            return hits
        except Exception as e:
            print(f"[Milvus] search failed: {e}")
            return []