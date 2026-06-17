import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as similarity from 'compute-cosine-similarity';

interface SearchResult {
  id: string;
  content: string;
  gist: string;
  score: number;
  category: string;
  timestamp: Date;
}

interface LayeredSearchResult {
  gist: string;
  details: () => Promise<string>;
  sourceId: string;
  score: number;
}

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);
  private embeddingCache = new Map<string, number[]>();

  constructor(private prisma: PrismaService) {}

  private async getEmbedding(text: string): Promise<number[]> {
    const cacheKey = text.slice(0, 100);
    if (this.embeddingCache.has(cacheKey)) {
      return this.embeddingCache.get(cacheKey)!;
    }

    const embedding = Array.from({ length: 384 }, () => Math.random() * 2 - 1);
    this.embeddingCache.set(cacheKey, embedding);
    
    if (this.embeddingCache.size > 1000) {
      this.embeddingCache.clear();
    }

    return embedding;
  }

  private extractGist(content: string): string {
    const sentences = content.split(/[。！？\n]/).filter((s) => s.trim());
    const firstFew = sentences.slice(0, 3).join('。');
    return firstFew.length > 150 ? firstFew.slice(0, 150) + '...' : firstFew;
  }

  async search(query: string, options?: {
    limit?: number;
    categories?: string[];
    minScore?: number;
  }): Promise<LayeredSearchResult[]> {
    const { limit = 5, categories, minScore = 0.3 } = options || {};

    const queryEmbedding = await this.getEmbedding(query);
    
    let documents = await this.prisma.resumeChunk.findMany({
      where: categories ? { category: { in: categories } } : undefined,
      select: {
        id: true,
        content: true,
        category: true,
        createdAt: true,
      },
    });

    const results: SearchResult[] = [];
    for (const doc of documents) {
      const docEmbedding = await this.getEmbedding(doc.content);
      const score = similarity(queryEmbedding, docEmbedding);
      
      if (score >= minScore) {
        results.push({
          id: doc.id,
          content: doc.content,
          gist: this.extractGist(doc.content),
          score,
          category: doc.category,
          timestamp: doc.createdAt,
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    
    return results.slice(0, limit).map((r) => ({
      gist: r.gist,
      details: async () => {
        const full = await this.prisma.resumeChunk.findUnique({
          where: { id: r.id },
          select: { content: true },
        });
        return full?.content || r.content;
      },
      sourceId: r.id,
      score: r.score,
    }));
  }

  async searchWithExpansion(query: string, expandCount = 2): Promise<{
    quickResults: LayeredSearchResult[];
    expandedResults: LayeredSearchResult[];
  }> {
    const allResults = await this.search(query, { limit: expandCount + 3 });
    
    const quickResults = allResults.slice(0, 3);
    const expandedResults = await Promise.all(
      allResults.slice(0, expandCount).map(async (r) => ({
        ...r,
        details: await r.details(),
      })),
    );

    return { quickResults, expandedResults };
  }

  async searchByCategory(query: string, category: string): Promise<LayeredSearchResult[]> {
    return this.search(query, { categories: [category] });
  }

  async getRelatedDocuments(documentId: string, limit = 3): Promise<LayeredSearchResult[]> {
    const document = await this.prisma.resumeChunk.findUnique({
      where: { id: documentId },
      select: { content: true, category: true },
    });

    if (!document) return [];

    return this.search(document.content, {
      categories: [document.category],
      limit,
    });
  }

  async semanticSearch(query: string): Promise<{
    results: LayeredSearchResult[];
    queryAnalysis: {
      keywords: string[];
      intent: 'question' | 'statement' | 'command';
      confidence: number;
    };
  }> {
    const results = await this.search(query);
    
    const keywords = this.extractKeywords(query);
    const intent = this.analyzeIntent(query);

    return {
      results,
      queryAnalysis: {
        keywords,
        intent,
        confidence: 0.85,
      },
    };
  }

  private extractKeywords(text: string): string[] {
    const patterns = [
      /([A-Za-z][a-zA-Z0-9]*)/g,
      /([\u4e00-\u9fa5]{2,})/g,
    ];

    const keywords: string[] = [];
    patterns.forEach((pattern) => {
      const matches = text.match(pattern);
      if (matches) keywords.push(...matches);
    });

    const stopWords = new Set(['的', '是', '在', '有', '和', '了', '我', '你', '他', '她', '它', '这', '那']);
    return [...new Set(keywords.filter((k) => !stopWords.has(k)))];
  }

  private analyzeIntent(text: string): 'question' | 'statement' | 'command' {
    if (text.includes('？') || text.includes('?') || text.includes('什么') || text.includes('怎么')) {
      return 'question';
    }
    if (text.includes('请') || text.includes('帮我') || text.includes('麻烦')) {
      return 'command';
    }
    return 'statement';
  }

  async updateDocument(documentId: string, content: string): Promise<void> {
    await this.prisma.resumeChunk.update({
      where: { id: documentId },
      data: { content, updatedAt: new Date() },
    });
    
    this.embeddingCache.clear();
  }
}
