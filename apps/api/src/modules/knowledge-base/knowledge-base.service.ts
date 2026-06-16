/**
 * 知识库服务 - 面试题库 RAG 通道
 *
 * 关键设计：
 *  - 独立 Qdrant collection 'interview_knowledge_base',与 semantic_cache 隔离
 *  - 启动时一次性导入 knowledge-base.json（已序列化题库）
 *  - 走 Qwen text-embedding-v3 embedding（与 semantic-cache 复用 client）
 *  - Point ID 用 kb-{qid}，已存在 upsert 模式（幂等）
 *  - 与 Mem0 / Milvus 长期记忆隔离：知识库是"system knowledge"全局共享
 *
 * 面试 Agent 出题时通过 recallByTopic / recallByQuery 召回相关题
 */

import { Injectable, Logger, OnModuleInit, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import { QdrantService } from '../../infra/qdrant/qdrant.service';
import { randomUUID } from 'crypto';

const COLLECTION = 'interview_knowledge_base';
const VECTOR_SIZE = 1024; // Qwen text-embedding-v3
const DEFAULT_KB_JSON = path.resolve(
  process.cwd(),
  'knowledge-base.json',
);

export interface KnowledgeItem {
  id: string;
  topic: string;
  number: number;
  title: string;
  body: string;
  tags: string[];
}

export interface KnowledgeSearchHit {
  id: string;
  score: number;
  item: KnowledgeItem;
}

@Injectable()
export class KnowledgeBaseService implements OnModuleInit {
  private readonly logger = new Logger(KnowledgeBaseService.name);
  private embedder: OpenAI;
  private enabled: boolean;
  private kbJsonPath: string;
  private imported = false;
  private importing = false;
  /** 内存缓存：导入成功后保留一份,recall 不必查 Qdrant 也能 fallback */
  private memoryCache: KnowledgeItem[] = [];

  constructor(
    private config: ConfigService,
    private qdrant: QdrantService,
  ) { }

  async onModuleInit() {
    this.enabled = this.config.get<string>('knowledgeBase.enabled') !== 'false';
    this.kbJsonPath = this.config.get<string>('knowledgeBase.jsonPath') || DEFAULT_KB_JSON;

    this.embedder = new OpenAI({
      apiKey: this.config.get<string>('qwen.apiKey'),
      baseURL: this.config.get<string>('qwen.baseUrl'),
    });

    if (this.enabled) {
      try {
        await this.ensureCollection();
      } catch (err: any) {
        this.logger.warn(`Qdrant KB collection init failed: ${err.message}`);
      }
    }
    this.logger.log(`✅ KnowledgeBase ready (enabled=${this.enabled}, json=${this.kbJsonPath})`);
  }

  private async ensureCollection() {
    const client = this.qdrant.getClient();
    const cols = await client.getCollections();
    const exists = cols.collections?.some((c) => c.name === COLLECTION);
    if (!exists) {
      await client.createCollection(COLLECTION, {
        vectors: { size: VECTOR_SIZE, distance: 'Cosine' },
      });
      await client.createPayloadIndex(COLLECTION, {
        field_name: 'topic',
        field_schema: 'keyword',
      });
      await client.createPayloadIndex(COLLECTION, {
        field_name: 'tags',
        field_schema: 'keyword',
      });
      this.logger.log(`Created Qdrant collection ${COLLECTION}`);
    }
  }

  /**
   * 启动后异步导入：knowledge-base.json → Qdrant
   * 幂等：已存在 point 会被 upsert 覆盖
   */
  async importFromJson(jsonPath?: string): Promise<{ total: number; imported: number; skipped: number; failed: number }> {
    if (this.importing) {
      this.logger.warn('Import already in progress, skip');
      return { total: 0, imported: 0, skipped: 0, failed: 0 };
    }
    if (this.imported) {
      this.logger.log('KB already imported, skip');
      return { total: 0, imported: 0, skipped: 0, failed: 0 };
    }
    const path_ = jsonPath || this.kbJsonPath;
    if (!fs.existsSync(path_)) {
      this.logger.warn(`KB json not found: ${path_}, skip import`);
      return { total: 0, imported: 0, skipped: 0, failed: 0 };
    }

    this.importing = true;
    let imported = 0;
    let skipped = 0;
    let failed = 0;
    let total = 0;
    try {
      const raw = fs.readFileSync(path_, 'utf8');
      const data = JSON.parse(raw) as { items: KnowledgeItem[]; totalQuestions: number };
      const items = data.items || [];
      this.memoryCache = items;
      total = items.length;
      this.logger.log(`📚 Importing ${items.length} questions to Qdrant KB...`);

      const client = this.qdrant.getClient();
      // 已有 id 集合：用于 skip（避免重复 embedding 烧钱）
      const existing = await this.scrollExistingItemIds();
      const toImport: KnowledgeItem[] = [];
      for (const item of items) {
        if (existing.has(item.id)) {
          skipped++;
        } else {
          toImport.push(item);
        }
      }

      // 批量 embedding + upsert，每批 10 条
      const BATCH = 10;
      for (let i = 0; i < toImport.length; i += BATCH) {
        const batch = toImport.slice(i, i + BATCH);
        const texts = batch.map((it) => `${it.title}\n\n${it.body}`.slice(0, 4096));
        let vectors: number[][];
        try {
          vectors = await this.embedBatch(texts);
        } catch (err: any) {
          this.logger.warn(`embedding batch ${i} failed: ${err.message}, mark all as failed`);
          failed += batch.length;
          continue;
        }

        // Qdrant 1.18 强制 point id 是 uint64 或 UUID
        const points = batch.map((item, idx) => ({
          id: randomUUID(),
          vector: vectors[idx],
          payload: {
            itemId: item.id, // 业务标识（字符串）
            topic: item.topic,
            number: item.number,
            title: item.title,
            body: item.body,
            tags: item.tags,
            source: 'interview-qa-bank',
          },
        }));

        try {
          await client.upsert(COLLECTION, { wait: false, points });
          imported += batch.length;
        } catch (err: any) {
          this.logger.warn(`upsert batch ${i} failed: ${err.message}`);
          failed += batch.length;
        }
      }

      this.imported = true;
      this.logger.log(
        `✅ KB import done: ${imported} imported, ${skipped} skipped (already exist), ${failed} failed`,
      );
    } catch (err: any) {
      this.logger.error(`KB import crashed: ${err.message}`);
      failed++;
    } finally {
      this.importing = false;
    }
    return { total, imported, skipped, failed };
  }

  /**
   * 滚动 Qdrant 已有 point id
   * 注意：Qdrant 1.18 强制 point id 是 uint64 或 UUID；我们用 UUID 存
   * 用 payload.itemId 字段（kb-{qid} 字符串）做业务标识
   * 启动时调一次,避免重复 embedding
   */
  private async scrollExistingItemIds(): Promise<Set<string>> {
    const ids = new Set<string>();
    try {
      const client = this.qdrant.getClient();
      let offset: string | number | undefined;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const res: any = await client.scroll(COLLECTION, {
          limit: 100,
          with_payload: true,
          with_vector: false,
          offset,
        });
        const points = res.points || [];
        for (const p of points) {
          const itemId = p.payload?.itemId;
          if (typeof itemId === 'string') {
            ids.add(itemId);
          }
        }
        if (!res.next_page_offset) break;
        offset = res.next_page_offset;
      }
    } catch (err: any) {
      this.logger.warn(`scrollExistingItemIds failed: ${err.message}`);
    }
    return ids;
  }

  /**
   * 召回：按 query 文本 cosine 检索
   * 可选 topic 过滤
   */
  async recall(query: string, opts: { topic?: string; limit?: number; threshold?: number } = {}): Promise<KnowledgeSearchHit[]> {
    if (!this.enabled) return [];
    const limit = opts.limit ?? 5;
    const threshold = opts.threshold ?? 0.35;

    let vector: number[];
    try {
      vector = await this.embedOne(query);
    } catch (err: any) {
      this.logger.warn(`recall embed failed: ${err.message}`);
      return this.fallbackMemorySearch(query, opts.topic, limit);
    }

    try {
      const client = this.qdrant.getClient();
      const filter: any = undefined;
      const must: any[] = [];
      if (opts.topic) {
        must.push({ key: 'topic', match: { value: opts.topic } });
      }
      const search = await client.search(COLLECTION, {
        vector,
        limit,
        score_threshold: threshold,
        filter: must.length > 0 ? { must } : undefined,
        with_payload: true,
      });

      return search.map((p: any) => ({
        id: p.id,
        score: p.score,
        item: {
          id: p.payload.itemId,
          topic: p.payload.topic,
          number: p.payload.number,
          title: p.payload.title,
          body: p.payload.body,
          tags: p.payload.tags || [],
        },
      }));
    } catch (err: any) {
      this.logger.warn(`Qdrant search failed: ${err.message}, fallback memory search`);
      return this.fallbackMemorySearch(query, opts.topic, limit);
    }
  }

  /**
   * 拉所有题（不 embedding）
   */
  async list(topic?: string, limit = 50): Promise<KnowledgeItem[]> {
    if (this.memoryCache.length > 0) {
      const filtered = topic
        ? this.memoryCache.filter((it) => it.topic === topic)
        : this.memoryCache;
      return filtered.slice(0, limit);
    }
    try {
      const client = this.qdrant.getClient();
      const filter = topic
        ? { must: [{ key: 'topic', match: { value: topic } }] }
        : undefined;
      const res: any = await client.scroll(COLLECTION, {
        limit,
        filter,
        with_payload: true,
      });
      return (res.points || []).map((p: any) => ({
        id: p.payload.itemId,
        topic: p.payload.topic,
        number: p.payload.number,
        title: p.payload.title,
        body: p.payload.body,
        tags: p.payload.tags || [],
      }));
    } catch (err: any) {
      this.logger.warn(`list failed: ${err.message}`);
      return [];
    }
  }

  /**
   * 按 topic 拉所有题（不 embedding）
   */
  async listByTopic(topic: string, limit = 20): Promise<KnowledgeItem[]> {
    if (this.memoryCache.length > 0) {
      return this.memoryCache.filter((it) => it.topic === topic).slice(0, limit);
    }
    try {
      const client = this.qdrant.getClient();
      const res: any = await client.scroll(COLLECTION, {
        limit,
        filter: { must: [{ key: 'topic', match: { value: topic } }] },
        with_payload: true,
      });
      return (res.points || []).map((p: any) => ({
        id: p.payload.itemId,
        topic: p.payload.topic,
        number: p.payload.number,
        title: p.payload.title,
        body: p.payload.body,
        tags: p.payload.tags || [],
      }));
    } catch (err: any) {
      this.logger.warn(`listByTopic failed: ${err.message}`);
      return [];
    }
  }

  getStats(): { enabled: boolean; imported: boolean; cachedItems: number } {
    return {
      enabled: this.enabled,
      imported: this.imported,
      cachedItems: this.memoryCache.length,
    };
  }

  /**
   * 手动添加/更新一条题到 Qdrant KB
   */
  async upsertItem(item: KnowledgeItem): Promise<KnowledgeItem> {
    // 1. 加到内存缓存
    const idx = this.memoryCache.findIndex((it) => it.id === item.id);
    if (idx >= 0) {
      this.memoryCache[idx] = item;
    } else {
      this.memoryCache.push(item);
    }

    // 2. 写入 Qdrant
    if (this.enabled) {
      try {
        const text = `${item.title}\n\n${item.body}`.slice(0, 4096);
        const vector = await this.embedOne(text);
        const client = this.qdrant.getClient();
        await client.upsert(COLLECTION, {
          wait: true,
          points: [
            {
              id: randomUUID(),
              vector,
              payload: {
                itemId: item.id,
                topic: item.topic,
                number: item.number,
                title: item.title,
                body: item.body,
                tags: item.tags,
                source: 'manual',
              },
            },
          ],
        });
        this.logger.log(`✅ KB upsert: ${item.id} (${item.title.slice(0, 30)})`);
      } catch (err: any) {
        this.logger.error(`KB upsert failed: ${err.message}`);
        throw err;
      }
    }

    return item;
  }

  // ===== private helpers =====

  private async embedOne(text: string): Promise<number[]> {
    const res = await this.embedder.embeddings.create({
      model: 'text-embedding-v3',
      input: text.slice(0, 4096),
      encoding_format: 'float',
      dimensions: VECTOR_SIZE,
    } as any);
    return res.data[0].embedding as number[];
  }

  private async embedBatch(texts: string[]): Promise<number[][]> {
    // Qwen embedding 一次最多 10 条,逐条也行
    if (texts.length === 1) {
      return [await this.embedOne(texts[0])];
    }
    // 用多次 embedOne 串行(避免 batch 限制差异)
    const out: number[][] = [];
    for (const t of texts) {
      out.push(await this.embedOne(t));
    }
    return out;
  }

  /** 兜底:如果 Qdrant 挂了,从内存缓存做关键词搜索 */
  private fallbackMemorySearch(query: string, topic: string | undefined, limit: number): KnowledgeSearchHit[] {
    if (this.memoryCache.length === 0) return [];
    const q = query.toLowerCase();
    const keywords = q.split(/\s+/).filter((s) => s.length >= 2);
    const scored = this.memoryCache
      .filter((it) => !topic || it.topic === topic)
      .map((it) => {
        const text = `${it.title} ${it.body} ${it.tags.join(' ')}`.toLowerCase();
        let score = 0;
        for (const kw of keywords) {
          if (text.includes(kw)) score += 1;
        }
        return { it, score: score / Math.max(keywords.length, 1) };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    return scored.map((s) => ({
      id: `kb-${s.it.id}`,
      score: s.score,
      item: s.it,
    }));
  }
}

/**
 * 应用启动后异步跑 import 钩子
 */
@Injectable()
export class KnowledgeBaseBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger(KnowledgeBaseBootstrap.name);
  constructor(private kb: KnowledgeBaseService) { }
  async onApplicationBootstrap() {
    // 异步、不阻塞启动
    setImmediate(() => {
      this.kb
        .importFromJson()
        .then((stats) => {
          this.logger.log(
            `KB import finished: total=${stats.total}, imported=${stats.imported}, skipped=${stats.skipped}, failed=${stats.failed}`,
          );
        })
        .catch((err) => {
          this.logger.warn(`KB import error: ${err.message}`);
        });
    });
  }
}
