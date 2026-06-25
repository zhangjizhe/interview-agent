import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MilvusClient, DataType, MetricType, IndexType } from '@zilliz/milvus2-sdk-node';
import OpenAI from 'openai';
import { ChatMessage, Memory } from '../interfaces/memory-store.interface';

/**
 * 长期记忆 - 写真实接入 Milvus 向量数据库
 *
 * 用 Qwen text-embedding-v3（1024 维）做 embedding
 * 简历 RAG + 候选人长期记忆都存这里
 */
@Injectable()
export class MilvusLongTermMemory implements OnModuleInit {
  private readonly logger = new Logger(MilvusLongTermMemory.name);
  private client: MilvusClient;
  private embedder: OpenAI;
  private readonly COLLECTION = 'interview_memories';
  private readonly VECTOR_DIM = 1024;

  constructor(private config: ConfigService) {}

  async onModuleInit() {
    const milvusUrl = this.config.get<string>('milvus.url') || 'http://localhost:19530';
    const qwenKey = this.config.get<string>('qwen.apiKey');
    const qwenBase = this.config.get<string>('qwen.baseUrl');

    this.client = new MilvusClient({ address: milvusUrl });
    this.embedder = new OpenAI({ apiKey: qwenKey, baseURL: qwenBase });

    await this.ensureCollection();
    this.logger.log(`✅ Long-term memory ready (Milvus ${milvusUrl})`);
  }

  private async ensureCollection() {
    try {
      const has = await this.client.hasCollection({
        collection_name: this.COLLECTION,
      });
      if (!has.value) {
        this.logger.log(`Creating Milvus collection: ${this.COLLECTION}`);
        await this.client.createCollection({
          collection_name: this.COLLECTION,
          fields: [
            { name: 'id', data_type: DataType.Int64, is_primary_key: true, autoID: true },
            { name: 'vector', data_type: DataType.FloatVector, dim: this.VECTOR_DIM },
            { name: 'userId', data_type: DataType.VarChar, max_length: 200 },
            { name: 'content', data_type: DataType.VarChar, max_length: 8000 },
            { name: 'source', data_type: DataType.VarChar, max_length: 50 },
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
        this.logger.log(`✅ Milvus collection ${this.COLLECTION} created + indexed`);
      } else {
        await this.client.loadCollection({ collection_name: this.COLLECTION });
        this.logger.log(`✅ Milvus collection ${this.COLLECTION} loaded`);
      }
    } catch (err) {
      this.logger.error(`ensureCollection failed: ${err.message}`);
    }
  }

  async memorize(userId: string, messages: ChatMessage[], source = 'conversation'): Promise<void> {
    if (messages.length === 0) return;
    try {
      const text = messages
        .map((m) => `${m.role}: ${m.content}`)
        .join('\n')
        .slice(0, 2000);

      const vector = await this.embedText(text);
      this.logger.debug(`Embedded ${text.length} chars, dim=${vector.length}`);

      const result = await this.client.insert({
        collection_name: this.COLLECTION,
        data: [
          {
            vector,
            userId,
            content: text,
            source,
            createdAt: new Date().toISOString(),
          },
        ],
      });

      this.logger.log(
        `✅ Memorized for ${userId}: ${result.insert_cnt} row(s) inserted`,
      );
    } catch (err) {
      this.logger.error(`memorize failed: ${err.message}`);
      throw err;
    }
  }

  async recall(userId: string, query: string, limit = 5): Promise<Memory[]> {
    try {
      const vector = await this.embedText(query);
      const result = await this.client.search({
        collection_name: this.COLLECTION,
        vector,
        limit,
        filter: `userId == "${userId}"`,
        output_fields: ['content', 'userId', 'source', 'createdAt'],
      });

      return result.results.map((r: any) => ({
        id: String(r.id),
        content: r.content || '',
        score: r.score,
        metadata: {
          userId: r.userId,
          source: r.source,
          createdAt: r.createdAt,
        },
      }));
    } catch (err) {
      this.logger.error(`recall failed: ${err.message}`);
      return [];
    }
  }

  async getAll(userId: string, source?: string): Promise<Memory[]> {
    try {
      const filter = source
        ? `userId == "${userId}" && source == "${source}"`
        : `userId == "${userId}"`;
      const result = await this.client.query({
        collection_name: this.COLLECTION,
        filter,
        output_fields: ['id', 'content', 'userId', 'source', 'createdAt'],
        limit: 100,
      });
      return result.data.map((r: any) => ({
        id: String(r.id),
        content: r.content,
        metadata: { userId: r.userId, source: r.source, createdAt: r.createdAt },
      }));
    } catch (err) {
      this.logger.error(`getAll failed: ${err.message}`);
      return [];
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