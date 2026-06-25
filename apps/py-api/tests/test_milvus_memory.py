"""test_milvus_memory.py · MilvusMemory URL 解析（P1-7 修复）

覆盖：
- urlparse 解析标准 URL
- 含密码 / 路径 / query 时不解析错位
- 默认 port 19530
- collection 字段定义
"""
import pytest


def test_milvus_urlparse_standard():
    """标准 http://host:port 解析正确"""
    from app.memory.milvus_memory import MilvusMemory
    m = MilvusMemory(url="http://milvus:19530")
    assert m.host == "milvus"
    assert m.port == 19530


def test_milvus_urlparse_no_port():
    """无端口 → 默认 19530"""
    from app.memory.milvus_memory import MilvusMemory
    m = MilvusMemory(url="http://milvus")
    assert m.host == "milvus"
    assert m.port == 19530


def test_milvus_urlparse_with_user_password():
    """P1-7 修复：http://user:pass@milvus:19530 → host='milvus'（不是 'user:pass@milvus'）"""
    from app.memory.milvus_memory import MilvusMemory
    m = MilvusMemory(url="http://user:pass@milvus:19530")
    assert m.host == "milvus"  # 不含 user:pass@
    assert m.port == 19530


def test_milvus_urlparse_with_path():
    """P1-7 修复：http://milvus:19530/v1 → port=19530（不是 '19530/v1'）"""
    from app.memory.milvus_memory import MilvusMemory
    m = MilvusMemory(url="http://milvus:19530/v1")
    assert m.port == 19530  # 不含 /v1


def test_milvus_urlparse_https():
    """https 协议也 OK"""
    from app.memory.milvus_memory import MilvusMemory
    m = MilvusMemory(url="https://milvus.example.com:443")
    assert m.host == "milvus.example.com"
    assert m.port == 443


def test_milvus_collection_constant():
    """collection 名常量正确"""
    from app.memory.milvus_memory import MilvusMemory
    assert MilvusMemory.COLLECTION == "interview_memories"
    assert MilvusMemory.VECTOR_DIM == 1024


def test_milvus_initial_state():
    """初始状态：未连接"""
    from app.memory.milvus_memory import MilvusMemory
    m = MilvusMemory(url="http://milvus:19530")
    assert m.connected is False
    assert m.collection is None