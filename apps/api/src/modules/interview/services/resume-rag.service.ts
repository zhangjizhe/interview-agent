import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { MilvusClient, DataType, MetricType, IndexType } from '@zilliz/milvus2-sdk-node';
import { ConfigService } from '@nestjs/config';
import { ParsedResume } from './resume-parser.service';

/**
 * 简历 RAG 服务（lazy init）
 *
 * Milvus collection 在首次使用时初始化，而非启动时。
 * 这样即使 Milvus 启动稍慢，也不会阻塞 API 启动。
 *
 * 流程：
 * 1. 简历解析 → 结构化字段
 * 2. 关键字段 embedding → 存 Milvus（按 userId 隔离）
 * 3. 面试开始时 → 检索相似历史简历 → 作为 Agent 上下文
 */
@Injectable()
export class ResumeRAGService {
  private readonly logger = new Logger(ResumeRAGService.name);
  private client: MilvusClient;
  private embedder: OpenAI;
  private readonly COLLECTION = 'resumes';
  private readonly VECTOR_DIM = 1024;
  private initialized = false;

  constructor(private config: ConfigService) {
    const milvusUrl = this.config.get<string>('milvus.url') || 'http://localhost:19530';
    const qwenKey = this.config.get<string>('qwen.apiKey');
    const qwenBase = this.config.get<string>('qwen.baseUrl');

    this.client = new MilvusClient({ address: milvusUrl });
    this.embedder = new OpenAI({ apiKey: qwenKey, baseURL: qwenBase });
  }

  /**
   * Lazy init：首次使用时连接 Milvus 并初始化 collection
   * 失败时 throw，让调用方感知错误而非静默降级
   */
  private async ensureCollection() {
    if (this.initialized) return;
    const maxRetries = 10;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const has = await this.client.hasCollection({ collection_name: this.COLLECTION });
        if (!has.value) {
          await this.client.createCollection({
            collection_name: this.COLLECTION,
            fields: [
              { name: 'id', data_type: DataType.Int64, is_primary_key: true, autoID: true },
              { name: 'vector', data_type: DataType.FloatVector, dim: this.VECTOR_DIM },
              { name: 'userId', data_type: DataType.VarChar, max_length: 200 },
              { name: 'name', data_type: DataType.VarChar, max_length: 100 },
              { name: 'position', data_type: DataType.VarChar, max_length: 100 },
              { name: 'summary', data_type: DataType.VarChar, max_length: 4000 },
              { name: 'skills', data_type: DataType.VarChar, max_length: 2000 },
              { name: 'createdAt', data_type: DataType.VarChar, max_length: 50 },
            ],
          });
          await this.client.createIndex({
            collection_name: this.COLLECTION,
            field_name: 'vector',
            index_type: IndexType.AUTOINDEX,
            metric_type: MetricType.COSINE,
          });
          await this.client.loadCollection({ collection_name: this.COLLECTION });
          this.logger.log(`✅ Resume collection created`);
        } else {
          await this.client.loadCollection({ collection_name: this.COLLECTION });
        }
        this.initialized = true;
        this.logger.log(`✅ Resume collection ready`);
        return;
      } catch (err) {
        this.logger.warn(
          `Resume collection init attempt ${attempt + 1}/${maxRetries} failed: ${err.message}`,
        );
        if (attempt < maxRetries - 1) {
          await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
        }
      }
    }
    throw new Error(
      `Resume collection init failed after ${maxRetries} retries — Milvus unavailable`,
    );
  }

  /**
   * 把解析后的简历存进 Milvus
   */
  async ingestResume(userId: string, position: string, parsed: ParsedResume): Promise<void> {
    await this.ensureCollection();
    try {
      const summary = `岗位: ${position}\n技能: ${parsed.skills?.join('、') || '无'}\n经验: ${(parsed.experience || []).slice(0, 3).join('; ')}\n项目: ${(parsed.projects || []).slice(0, 2).join('、')}`;
      const text = `${summary}\n\n${parsed.rawText?.slice(0, 1500) || ''}`;
      const vector = await this.embedText(text);

      await this.client.insert({
        collection_name: this.COLLECTION,
        data: [
          {
            vector,
            userId,
            name: parsed.name || '未命名候选人',
            position,
            summary,
            skills: (parsed.skills || []).join('、'),
            createdAt: new Date().toISOString(),
          },
        ],
      });

      this.logger.log(`✅ Resume ingested for ${userId} (position=${position})`);
    } catch (err) {
      this.logger.error(`Resume ingest failed: ${err.message}`);
      throw err;
    }
  }

  async searchByUser(
    userId: string,
    limit = 3,
  ): Promise<Array<{ name?: string; position: string; summary: string; skills: string; createdAt: string; score?: number }>> {
    await this.ensureCollection();
    try {
      const result = await this.client.query({
        collection_name: this.COLLECTION,
        filter: `userId == "${userId}"`,
        output_fields: ['name', 'position', 'summary', 'skills', 'createdAt'],
        limit,
      });
      return (result.data as any) || [];
    } catch (err) {
      this.logger.error(`Resume search failed: ${err.message}`);
      throw err;
    }
  }

  async searchSimilar(
    position: string,
    query: string,
    limit = 5,
  ): Promise<Array<{ userId: string; position: string; summary: string; skills: string; score: number }>> {
    await this.ensureCollection();
    try {
      const vector = await this.embedText(query);
      const result = await this.client.search({
        collection_name: this.COLLECTION,
        vector,
        limit,
        filter: `position == "${position}"`,
        output_fields: ['userId', 'position', 'summary', 'skills'],
      });
      return result.results.map((r: any) => ({
        userId: r.userId,
        position: r.position,
        summary: r.summary,
        skills: r.skills,
        score: r.score,
      }));
    } catch (err) {
      this.logger.error(`Resume similar search failed: ${err.message}`);
      throw err;
    }
  }

  private async embedText(text: string): Promise<number[]> {
    const res = await this.embedder.embeddings.create({
      model: 'text-embedding-v3',
      input: text.slice(0, 2048),
    });
    return res.data[0].embedding;
  }
}
