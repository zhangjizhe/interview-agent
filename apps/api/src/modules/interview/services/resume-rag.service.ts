import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { MilvusClient, DataType, MetricType, IndexType, ConsistencyLevelEnum } from '@zilliz/milvus2-sdk-node';
import { ConfigService } from '@nestjs/config';
import { ParsedResume } from './resume-parser.service';
import { scrubPdfStructureNoise, isPdfStructureToken } from '../../../common/pdf-noise';

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

    this.client = new MilvusClient({ address: milvusUrl, timeout: 5000 });
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
   * 二次保险：即使上游 ResumeParserService 漏过 PDF 元数据，ingest 前再清一次
   * rawText 段，并过滤掉 name/skills 里的 PDF 结构 token
   */
  async ingestResume(userId: string, position: string, parsed: ParsedResume): Promise<void> {
    await this.ensureCollection();
    try {
      // 二次清洗：name / skills / summary 段可能含 PDF 元数据泄漏
      const cleanName = isPdfStructureToken(parsed.name || '')
        ? '未命名候选人'
        : parsed.name || '未命名候选人';
      const cleanSkills = (parsed.skills || []).filter((s) => !isPdfStructureToken(s));
      const cleanExperience = (parsed.experience || []).filter((s) => !isPdfStructureToken(s));
      const cleanProjects = (parsed.projects || []).filter((s) => !isPdfStructureToken(s));
      const cleanRawText = scrubPdfStructureNoise(parsed.rawText || '');

      const summary = `岗位: ${position}\n技能: ${cleanSkills.join('、') || '无'}\n经验: ${cleanExperience.slice(0, 3).join('; ')}\n项目: ${cleanProjects.slice(0, 2).join('、')}`;
      const text = `${summary}\n\n${cleanRawText.slice(0, 1500)}`;
      const vector = await this.embedText(text);

      const row = {
        vector, userId, name: cleanName, position, summary,
        skills: cleanSkills.join('、'), createdAt: new Date().toISOString(),
      };
      const receipt = await this.storageDeadline(this.client.insert({
        collection_name: this.COLLECTION, timeout: 5000, data: [row],
      }));
      this.assertStorageResponse(receipt);
      const ids = (receipt.IDs as any)?.int_id?.data;
      const value = Array.isArray(ids) && ids.length === 1 ? ids[0] : undefined;
      if (Number(receipt.insert_cnt) !== 1
        || !((typeof value === 'string' && /^\d+$/.test(value)) || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0))
        || BigInt(value) > 9223372036854775807n) throw new Error('RESUME_STORAGE_UNCONFIRMED');
      const id = BigInt(value).toString();
      const stored = await this.storageDeadline(this.client.query({
        collection_name: this.COLLECTION, timeout: 5000,
        consistency_level: ConsistencyLevelEnum.Strong,
        filter: `id == ${id} && userId == ${JSON.stringify(userId)}`,
        output_fields: ['id', 'userId', 'name', 'position', 'summary', 'skills', 'createdAt'], limit: 2,
      }));
      this.assertStorageResponse(stored);
      const actual = Array.isArray(stored.data) && stored.data.length === 1 ? stored.data[0] as any : undefined;
      if (!actual || String(actual.id) !== id
        || !(['userId', 'name', 'position', 'summary', 'skills', 'createdAt'] as const).every(key => actual[key] === row[key])) {
        throw new Error('RESUME_STORAGE_UNCONFIRMED');
      }

      this.logger.log(`✅ Resume ingested for ${userId} (position=${position})`);
    } catch (err) {
      this.logger.error({ event: 'resume_storage_unconfirmed' });
      throw err;
    }
  }

  private assertStorageResponse(result: any) {
    if (!result?.status || !['Success', '0'].includes(String(result.status.error_code))
      || (result.status.code !== undefined && result.status.code !== 0)) throw new Error('RESUME_STORAGE_UNCONFIRMED');
  }

  // SDK insert performs a schema lookup before its timed Insert RPC. Bound the
  // whole call as well; expiry is an unknown write, never proof of cancellation.
  private async storageDeadline<T>(request: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([request, new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('RESUME_STORAGE_UNCONFIRMED')), 5000);
      })]);
    } finally { if (timer) clearTimeout(timer); }
  }

  async searchByUser(
    userId: string,
    limit = 3,
  ): Promise<Array<{ name?: string; position: string; summary: string; skills: string; createdAt: string; score?: number }>> {
    await this.ensureCollection();
    try {
      const result = await this.storageDeadline(this.client.query({
        collection_name: this.COLLECTION,
        filter: `userId == ${JSON.stringify(userId)}`,
        consistency_level: ConsistencyLevelEnum.Strong, timeout: 5000,
        output_fields: ['name', 'position', 'summary', 'skills', 'createdAt'],
        limit,
      }));
      this.assertStorageResponse(result);
      if (!Array.isArray(result.data)) throw new Error('RESUME_STORAGE_UNCONFIRMED');
      const raw = result.data as any[];
      // 读取侧清洗：旧数据（修复前上传）可能含 PDF 元数据，
      // 返回前再洗一次 name/skills/summary，确保前端不会展示 %PDF-1.7 / /ICCBased 等
      const cleaned = raw.map((r: any) => ({
        ...r,
        name: isPdfStructureToken(r.name || '') ? undefined : r.name,
        position: r.position,
        summary: scrubPdfStructureNoise(r.summary || ''),
        skills: (r.skills || '')
          .split(/[、,，;；\s]+/)
          .filter((s: string) => s && !isPdfStructureToken(s))
          .join('、'),
      }));
      // 仅排序本次 limit 返回窗口；Milvus query 无全局顺序保证，不能据此保证全局最新版本。
      cleaned.sort((a: any, b: any) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      return cleaned;
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
      encoding_format: 'float',
    });
    const vector = res.data?.[0]?.embedding;
    if (!Array.isArray(vector) || vector.length !== this.VECTOR_DIM
      || !Array.from(vector).every(value => typeof value === 'number' && Number.isFinite(value))) {
      throw new Error('RESUME_EMBEDDING_INVALID');
    }
    return vector;
  }
}
