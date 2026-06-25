import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { MilvusClient, DataType, MetricType, IndexType } from '@zilliz/milvus2-sdk-node';
import { ConfigService } from '@nestjs/config';
import { ParsedResume } from './resume-parser.service';
import { scrubPdfStructureNoise, isPdfStructureToken } from '../../../common/pdf-noise';
import { EncryptionService } from '../../pii/encryption.service';
import { escapeMilvusString } from './escape-milvus.util';

@Injectable()
export class ResumeRAGService {
  private readonly logger = new Logger(ResumeRAGService.name);
  private client: MilvusClient;
  private embedder: OpenAI;
  private readonly COLLECTION = 'resumes';
  private readonly VECTOR_DIM = 1024;
  private initialized = false;

  constructor(
    private config: ConfigService,
    private encryption: EncryptionService,
  ) {
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
              { name: 'nameEncrypted', data_type: DataType.VarChar, max_length: 2000 },
              { name: 'position', data_type: DataType.VarChar, max_length: 100 },
              { name: 'summary', data_type: DataType.VarChar, max_length: 4000 },
              { name: 'skills', data_type: DataType.VarChar, max_length: 2000 },
              { name: 'createdAt', data_type: DataType.VarChar, max_length: 50 },
              { name: 'expiresAt', data_type: DataType.VarChar, max_length: 50 },
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

      const namePseudonym = this.encryption.hashPseudonym(cleanName, userId);
      const nameEncrypted = this.encryption.encrypt(cleanName);

      await this.client.insert({
        collection_name: this.COLLECTION,
        data: [
          {
            vector,
            userId,
            name: namePseudonym,
            nameEncrypted: JSON.stringify(nameEncrypted),
            position,
            summary,
            skills: cleanSkills.join('、'),
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          },
        ],
      });

      this.logger.log(`✅ Resume ingested for ${userId} (position=${position}, PII encrypted)`);
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
      const safeUserId = escapeMilvusString(userId);
      const result = await this.client.query({
        collection_name: this.COLLECTION,
        filter: `userId == "${safeUserId}"`,
        output_fields: ['name', 'nameEncrypted', 'position', 'summary', 'skills', 'createdAt'],
        limit,
      });
      const raw = (result.data as any) || [];
      const cleaned = raw.map((r: any) => {
        let decryptedName: string | undefined;
        if (r.nameEncrypted) {
          try {
            const enc = JSON.parse(r.nameEncrypted);
            decryptedName = this.encryption.decrypt(enc);
          } catch {
            decryptedName = undefined;
          }
        }
        const displayName = decryptedName && !isPdfStructureToken(decryptedName)
          ? decryptedName
          : undefined;
        return {
          ...r,
          name: displayName,
          position: r.position,
          summary: scrubPdfStructureNoise(r.summary || ''),
          skills: (r.skills || '')
            .split(/[、,，;；\s]+/)
            .filter((s: string) => s && !isPdfStructureToken(s))
            .join('、'),
        };
      });
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
      const safePosition = escapeMilvusString(position);
      const vector = await this.embedText(query);
      const result = await this.client.search({
        collection_name: this.COLLECTION,
        vector,
        limit,
        filter: `position == "${safePosition}"`,
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

  async cleanExpiredResumes(): Promise<number> {
    try {
      await this.ensureCollection();
      const now = new Date().toISOString();
      const result = await this.client.delete({
        collection_name: this.COLLECTION,
        filter: `expiresAt < "${now}"`,
      });
      const deleted = (result as any)?.deleteCount || 0;
      this.logger.log(`🧹 Expired resumes cleaned: ${deleted}`);
      return deleted;
    } catch (err: any) {
      this.logger.warn(`Resume cleanup failed (non-critical): ${err.message}`);
      return 0;
    }
  }

  async deleteResumesByUser(userId: string): Promise<number> {
    try {
      await this.ensureCollection();
      const safeUserId = escapeMilvusString(userId);
      const result = await this.client.delete({
        collection_name: this.COLLECTION,
        filter: `userId == "${safeUserId}"`,
      });
      const deleted = (result as any)?.deleteCount || 0;
      this.logger.log(`🧹 Resumes deleted for user ${userId}: ${deleted}`);
      return deleted;
    } catch (err: any) {
      this.logger.warn(`Resume user deletion failed (non-critical): ${err.message}`);
      return 0;
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
