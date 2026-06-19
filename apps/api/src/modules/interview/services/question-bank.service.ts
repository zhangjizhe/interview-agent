/**
 * 面试题知识库（混合检索 + Rerank，lazy init）
 *
 * Milvus collection 在首次使用时初始化，而非启动时。
 *
 * 检索流程：
 * 1. 用户上传面试题（题目 + 答案 + 岗位 + 难度 + 标签）
 * 2. 文本 embedding → 存 Milvus（独立 collection：question_bank_v2）
 *    同时存原始文本 → Milvus BM25 自动生成分词 + 稀疏向量
 * 3. 搜索时双路召回：
 *    - 语义路：dense vector (text-embedding-v3, 1024d) → COSINE
 *    - 关键词路：BM25 sparse vector → 内置分词
 * 4. Milvus RRF 合并双路结果
 * 5. 可选：通义 gte-rerank-v2 精排
 *
 * 用例：面试复盘时，Agent 自动从知识库找同主题的真题做强化练习
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  MilvusClient,
  DataType,
  MetricType,
  IndexType,
  FunctionType,
} from '@zilliz/milvus2-sdk-node';

export interface QuestionItem {
  id?: string;          // Milvus auto-id
  questionId: string;    // 业务 id（uuid）
  position: string;      // 岗位
  level: string;         // 难度 P4/P5/P6/P7
  category: string;      // 分类（如"系统设计"）
  question: string;      // 题干
  answer: string;        // 参考答案
  tags: string;          // 标签，逗号分隔
  createdAt: string;     // ISO 时间
}

/** Rerank 后的单条结果 */
export interface RerankedQuestion extends QuestionItem {
  score: number;         // 原始 RRF 分数
  rerankScore?: number;  // Rerank 精排分数（仅 rerank 开启时有）
}

@Injectable()
export class QuestionBankService {
  private readonly logger = new Logger(QuestionBankService.name);
  private client: MilvusClient;
  private embedder: OpenAI;

  /** v2 collection：支持混合检索 */
  private readonly COLLECTION = 'question_bank_v2';
  private readonly VECTOR_DIM = 1024;

  /** Rerank 开关（默认开启，API Key 缺失时自动关闭） */
  private rerankEnabled = false;
  private dashscopeApiKey = '';
  private initialized = false;

  constructor(private config: ConfigService) {
    const milvusUrl = this.config.get<string>('milvus.url') || 'http://localhost:19530';
    const qwenKey = this.config.get<string>('qwen.apiKey');
    const qwenBase = this.config.get<string>('qwen.baseUrl');

    this.client = new MilvusClient({ address: milvusUrl });
    this.embedder = new OpenAI({ apiKey: qwenKey, baseURL: qwenBase });

    // Rerank 用 DashScope API Key（和 Qwen 共用同一个 key）
    this.dashscopeApiKey = qwenKey || '';
    if (this.dashscopeApiKey) {
      this.rerankEnabled = true;
    }
  }

  // ===== Collection 初始化 =====

  /**
   * Lazy init：首次使用时连接 Milvus 并初始化 collection
   */
  private async ensureCollection() {
    if (this.initialized) return;
    const maxRetries = 10;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const has = await this.client.hasCollection({ collection_name: this.COLLECTION });
        if (!has.value) {
          await this.createV2Collection();
        } else {
          await this.client.loadCollection({ collection_name: this.COLLECTION });
          this.logger.log(`✅ Question bank v2 collection loaded`);
        }
        this.initialized = true;
        this.logger.log(`✅ Question bank v2 collection ready`);
        return;
      } catch (err: any) {
        this.logger.warn(
          `Question bank init attempt ${attempt + 1}/${maxRetries} failed: ${err.message}`,
        );
        if (attempt < maxRetries - 1) {
          await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
        }
      }
    }
    throw new Error(
      `Question bank init failed after ${maxRetries} retries — Milvus unavailable`,
    );
  }

  /**
   * 创建 v2 collection（dense + sparse 双向量 + BM25 Function）
   *
   * 字段：
   * - id: 主键
   * - vector: dense vector (1024d, text-embedding-v3)
   * - sparse_bm25: sparse vector (BM25 自动生成)
   * - text: 原始文本（question + answer + tags 拼接，用于 BM25 分词）
   * - questionId / position / level / category / question / answer / tags / createdAt
   */
  private async createV2Collection() {
    try {
      // 1. 创建 schema
      await this.client.createCollection({
        collection_name: this.COLLECTION,
        fields: [
          { name: 'id', data_type: DataType.Int64, is_primary_key: true, autoID: true },
          // dense vector（语义检索）
          { name: 'vector', data_type: DataType.FloatVector, dim: this.VECTOR_DIM },
          // sparse vector（BM25 全文检索，由 Function 自动填充）
          { name: 'sparse_bm25', data_type: DataType.SparseFloatVector },
          // 原始文本（BM25 输入，enable_analyzer 开启分词）
          {
            name: 'text',
            data_type: DataType.VarChar,
            max_length: 8000,
            enable_analyzer: true,
            analyzer_params: { type: 'chinese' }, // 中文分词（Jieba）
            enable_match: true,
          },
          // 业务字段
          { name: 'questionId', data_type: DataType.VarChar, max_length: 100 },
          { name: 'position', data_type: DataType.VarChar, max_length: 100 },
          { name: 'level', data_type: DataType.VarChar, max_length: 20 },
          { name: 'category', data_type: DataType.VarChar, max_length: 100 },
          { name: 'question', data_type: DataType.VarChar, max_length: 4000 },
          { name: 'answer', data_type: DataType.VarChar, max_length: 8000 },
          { name: 'tags', data_type: DataType.VarChar, max_length: 500 },
          { name: 'createdAt', data_type: DataType.VarChar, max_length: 50 },
        ],
        functions: [
          {
            name: 'bm25_fn',
            // v13 老代码用 function_type，新 SDK 类型只认 type
            type: FunctionType.BM25,
            input_field_names: ['text'],
            output_field_names: ['sparse_bm25'],
            params: {},
          },
        ],
      });

      // 2. 创建索引
      // dense vector 索引
      await this.client.createIndex({
        collection_name: this.COLLECTION,
        field_name: 'vector',
        index_type: IndexType.AUTOINDEX,
        metric_type: MetricType.COSINE,
      });
      // sparse vector 索引（BM25 用 SPARSE_INVERTED_INDEX）
      await this.client.createIndex({
        collection_name: this.COLLECTION,
        field_name: 'sparse_bm25',
        index_type: 'SPARSE_INVERTED_INDEX' as any,
        metric_type: 'BM25' as any,
      });

      // 3. 加载
      await this.client.loadCollection({ collection_name: this.COLLECTION });
      this.logger.log(`✅ Question bank v2 collection created (dense + BM25 hybrid)`);
    } catch (err: any) {
      this.logger.error(`createV2Collection failed: ${err.message}`);
      throw err;
    }
  }

  // ===== 写入 =====

  /**
   * 把题目存进知识库
   */
  async addQuestion(item: Omit<QuestionItem, 'id' | 'createdAt'>): Promise<{ questionId: string }> {
    await this.ensureCollection();
    try {
      const text = `${item.question}\n\n${item.answer}\n\n${item.tags}`;
      const vector = await this.embedText(text);

      await this.client.insert({
        collection_name: this.COLLECTION,
        data: [
          {
            vector,
            text, // BM25 输入字段
            questionId: item.questionId,
            position: item.position,
            level: item.level,
            category: item.category,
            question: item.question,
            answer: item.answer,
            tags: item.tags,
            createdAt: new Date().toISOString(),
          },
        ],
      });
      this.logger.log(`Added question ${item.questionId} (${item.position}/${item.level})`);
      return { questionId: item.questionId };
    } catch (err: any) {
      this.logger.error(`addQuestion failed: ${err.message}`);
      throw err;
    }
  }

  /**
   * 批量上传题目
   */
  async addQuestions(items: Array<Omit<QuestionItem, 'id' | 'createdAt'>>): Promise<{ count: number }> {
    if (items.length === 0) return { count: 0 };
    await this.ensureCollection();
    try {
      const texts = items.map((it) => `${it.question}\n\n${it.answer}\n\n${it.tags}`);
      const vectors = await Promise.all(texts.map((t) => this.embedText(t)));
      const now = new Date().toISOString();
      await this.client.insert({
        collection_name: this.COLLECTION,
        data: items.map((it, i) => ({
          vector: vectors[i],
          text: texts[i], // BM25 输入字段
          questionId: it.questionId,
          position: it.position,
          level: it.level,
          category: it.category,
          question: it.question,
          answer: it.answer,
          tags: it.tags,
          createdAt: now,
        })),
      });
      this.logger.log(`Added ${items.length} questions in batch`);
      return { count: items.length };
    } catch (err: any) {
      this.logger.error(`addQuestions failed: ${err.message}`);
      throw err;
    }
  }

  // ===== 搜索 =====

  /**
   * 混合检索题目（语义 + BM25 双路召回 → RRF 合并 → 可选 Rerank 精排）
   *
   * @param query 搜索 query
   * @param options 过滤条件 + limit + 是否开启 rerank
   */
  async search(
    query: string,
    options: {
      position?: string;
      level?: string;
      category?: string;
      limit?: number;
      rerank?: boolean; // 默认 true
    } = {},
  ): Promise<Array<RerankedQuestion>> {
    await this.ensureCollection();
    try {
      const { position, level, category, limit = 5, rerank = true } = options;

      // 拼 filter
      const filters: string[] = [];
      if (position) filters.push(`position == "${position}"`);
      if (level) filters.push(`level == "${level}"`);
      if (category) filters.push(`category == "${category}"`);
      const filter = filters.length > 0 ? filters.join(' and ') : undefined;

      // 双路召回
      const vector = await this.embedText(query);
      const outputFields = [
        'questionId', 'position', 'level', 'category',
        'question', 'answer', 'tags', 'createdAt',
      ];

      // 混合检索：dense + BM25 → RRF
      const hybridResult = await this.client.hybridSearch({
        collection_name: this.COLLECTION,
        data: [
          // 语义路：dense vector
          {
            data: [vector],
            anns_field: 'vector',
            params: { nprobe: 10 },
          },
          // 关键词路：BM25（传原始文本，Milvus 自动转 sparse vector）
          // 新 SDK VectorTypes 不含 string，用 as any 绕类型（运行时 OK）
          {
            data: [query] as any,
            anns_field: 'sparse_bm25',
          },
        ],
        rerank: {
          strategy: 'rrf',
          params: { k: 60 },
        },
        limit,
        filter,
        output_fields: outputFields,
      });

      const results: Array<RerankedQuestion> = (hybridResult.results || []).map((r: any) => ({
        id: String(r.id),
        questionId: r.questionId,
        position: r.position,
        level: r.level,
        category: r.category,
        question: r.question,
        answer: r.answer,
        tags: r.tags,
        createdAt: r.createdAt,
        score: r.score,
      }));

      // Rerank 精排
      if (rerank && this.rerankEnabled && results.length > 0) {
        return await this.rerankResults(query, results);
      }

      return results;
    } catch (err: any) {
      this.logger.error(`Question search failed: ${err.message}`);
      throw err;
    }
  }

  // ===== Rerank =====

  /**
   * 通义 gte-rerank-v2 精排
   *
   * API: POST https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank
   * 模型: gte-rerank-v2
   */
  private async rerankResults(
    query: string,
    results: Array<RerankedQuestion>,
  ): Promise<Array<RerankedQuestion>> {
    try {
      const documents = results.map((r) =>
        `【${r.category}·${r.level}】${r.question}\n${r.answer}\n标签: ${r.tags}`,
      );

      const res = await fetch(
        'https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.dashscopeApiKey}`,
          },
          body: JSON.stringify({
            model: 'gte-rerank-v2',
            input: { query, documents },
            parameters: { return_documents: false, top_n: results.length },
          }),
        },
      );

      if (!res.ok) {
        const txt = await res.text();
        this.logger.warn(`Rerank API failed: ${res.status} ${txt.slice(0, 200)}`);
        return results; // 降级返回原始结果
      }

      const data: any = await res.json();
      const rankings: Array<{ index: number; relevance_score: number }> =
        data.output?.results || [];

      // 按 rerank 分数重排
      const reranked = rankings
        .sort((a, b) => b.relevance_score - a.relevance_score)
        .map((r) => ({
          ...results[r.index],
          rerankScore: r.relevance_score,
        }));

      this.logger.debug(
        `Rerank: top1="${reranked[0]?.questionId}" score=${reranked[0]?.rerankScore?.toFixed(4)}`,
      );
      return reranked;
    } catch (err: any) {
      this.logger.warn(`Rerank failed: ${err.message}, using raw results`);
      return results;
    }
  }

  // ===== 列表 / 删除 =====

  /**
   * 列出所有题目（按 position 过滤）
   */
  async list(position?: string, limit = 20): Promise<QuestionItem[]> {
    await this.ensureCollection();
    try {
      const filter = position ? `position == "${position}"` : undefined;
      const result = await this.client.query({
        collection_name: this.COLLECTION,
        filter,
        output_fields: ['questionId', 'position', 'level', 'category', 'question', 'answer', 'tags', 'createdAt'],
        limit,
      });
      return ((result.data as any) || []).map((r: any) => ({
        id: String(r.id),
        questionId: r.questionId,
        position: r.position,
        level: r.level,
        category: r.category,
        question: r.question,
        answer: r.answer,
        tags: r.tags,
        createdAt: r.createdAt,
      }));
    } catch (err: any) {
      this.logger.error(`Question list failed: ${err.message}`);
      throw err;
    }
  }

  /**
   * 按 questionId 删除
   */
  async deleteQuestion(questionId: string): Promise<{ deleted: boolean }> {
    await this.ensureCollection();
    try {
      await this.client.delete({
        collection_name: this.COLLECTION,
        filter: `questionId == "${questionId}"`,
      });
      return { deleted: true };
    } catch (err: any) {
      this.logger.error(`deleteQuestion failed: ${err.message}`);
      return { deleted: false };
    }
  }

  // ===== 内部工具 =====

  private async embedText(text: string): Promise<number[]> {
    const res = await this.embedder.embeddings.create({
      model: 'text-embedding-v3',
      input: text.slice(0, 4000),
      dimensions: this.VECTOR_DIM,
    });
    return res.data[0].embedding;
  }

  /**
   * LLM 从文本中提取结构化面试题
   * 用 Qwen（embedder 同源）跑 chat.completions
   */
  async extractQuestionsFromText(
    text: string,
    position: string,
    level: string = 'P5',
    category: string = '通用',
  ): Promise<Array<Omit<QuestionItem, 'id' | 'createdAt'>>> {
    const prompt = `你是一位资深的面试题库整理员。请从以下【面试题文本】中提取所有结构化面试题。

【岗位参考】${position}（难度参考 ${level}）

【输出要求】严格 JSON 数组，字段：
[
  {
    "question": "完整的题干（保留原始表述）",
    "answer": "参考答案（如果文本里没有，写'参见 XX 文档 / 无标准答案'）",
    "tags": ["技术标签1", "技术标签2"]
  }
]

【注意事项】
1. 一道题一个对象，多道题用逗号分隔
2. 题干必须从原文摘，不要改写
3. 标签用 2-4 个关键词（如"Redis" "限流" "分布式"）
4. 跳过纯标题 / 目录 / 版权信息
5. 文本里没有明显题目时返回空数组 []

【面试题文本】
${text.slice(0, 6000)}
`;
    try {
      const res = await this.embedder.chat.completions.create({
        model: 'qwen-plus',
        messages: [
          { role: 'system', content: '你是一个专业的面试题整理 AI，只输出 JSON。' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      });
      const content = res.choices[0]?.message?.content || '{}';
      let parsed: any = {};
      try {
        parsed = JSON.parse(content);
      } catch {
        const m = content.match(/\[[\s\S]*\]/);
        if (m) parsed = JSON.parse(m[0]);
      }
      const items: any[] = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.questions)
          ? parsed.questions
          : Array.isArray(parsed.items)
            ? parsed.items
            : [];
      return items
        .filter((it) => it?.question && it?.answer)
        .map((it, idx) => ({
          questionId: `q-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
          position,
          level,
          category,
          question: String(it.question).slice(0, 1000),
          answer: String(it.answer).slice(0, 2000),
          tags: (it.tags || []).join('、').slice(0, 200),
        }));
    } catch (err: any) {
      this.logger.error(`LLM extract questions failed: ${err.message}`);
      return [];
    }
  }

  /**
   * 从文件/URL 导入题目（先解析文本，再 LLM 提取）
   */
  async importQuestions(args: {
    text: string;
    position: string;
    level?: string;
    category?: string;
    source: string;
  }): Promise<{ count: number; questionIds: string[] }> {
    const extracted = await this.extractQuestionsFromText(
      args.text,
      args.position,
      args.level,
      args.category,
    );
    if (extracted.length === 0) {
      return { count: 0, questionIds: [] };
    }
    await this.addQuestions(extracted);
    this.logger.log(`✅ Imported ${extracted.length} questions from ${args.source}`);
    return {
      count: extracted.length,
      questionIds: extracted.map((q) => q.questionId),
    };
  }
}
