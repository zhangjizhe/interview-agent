-- pgvector 扩展（Mem0 OSS 用 pgvector 作为向量存储后端）
CREATE EXTENSION IF NOT EXISTS vector;

-- Mem0 自己的 auth/config 数据库（由 Mem0 server 通过 APP_DB_NAME 读取）
-- 默认值是 mem0_app，必须预先创建，否则 Mem0 启动失败
SELECT 'CREATE DATABASE mem0_app'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'mem0_app')\gexec

-- 给业务用的扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";