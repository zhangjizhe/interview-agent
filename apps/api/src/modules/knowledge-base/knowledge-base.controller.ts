/**
 * GET /api/knowledge-base/* - 题库 RAG 召回端点
 *
 * 用途：面试 Agent 出题/回答时从这里召回相关题
 *  - GET /api/knowledge-base/recall?q=...&topic=...&limit=5&threshold=0.6&debug=true
 *  - GET /api/knowledge-base/topic/:topic
 *  - GET /api/knowledge-base/stats
 *  - POST /api/knowledge-base/import （手动触发导入）
 *  - POST /api/knowledge-base/benchmark （跑召回率 benchmark）
 */

import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Query,
  Param,
  Logger,
  Body,
} from '@nestjs/common';
import { KnowledgeBaseService, KnowledgeSearchHit } from './knowledge-base.service';

interface DebugInfo {
  query: string;
  topic?: string;
  limit: number;
  threshold: number;
  totalCandidates: number;
  returnedCount: number;
  filteredOut: number;
  latencyMs: number;
  topScore: number;
  minScore: number;
  matchedFields: Record<string, number>; // 字段命中计数
  scoreDistribution: Array<{ range: string; count: number }>;
}

@Controller('knowledge-base')
export class KnowledgeBaseController {
  private readonly logger = new Logger(KnowledgeBaseController.name);
  constructor(private kb: KnowledgeBaseService) {}

  /**
   * 召回搜索
   * Query 参数:
   *  - q: 必填,查询文本
   *  - topic: 可选,主题过滤
   *  - limit: 可选,默认 5
   *  - threshold: 可选,默认 0.6
   *  - debug: 可选,默认 false;true 时返回调试信息(score/字段命中/分布)
   */
  @Get('recall')
  async recall(
    @Query('q') q: string,
    @Query('query') query: string,
    @Query('topic') topic?: string,
    @Query('limit') limitStr?: string,
    @Query('threshold') thresholdStr?: string,
    @Query('debug') debugStr?: string,
  ) {
    const queryText = q || query;
    if (!queryText) return { hits: [], total: 0 };
    const limit = limitStr ? parseInt(limitStr, 10) : 5;
    const threshold = thresholdStr ? parseFloat(thresholdStr) : 0.35;
    const debug = debugStr === 'true';

    const start = Date.now();
    const hits = await this.kb.recall(queryText, { topic, limit, threshold });
    const latencyMs = Date.now() - start;

    const out: any = { hits, total: hits.length, query: queryText };
    if (debug) {
      out.debug = this.buildDebugInfo(hits, queryText, topic, limit, threshold, latencyMs);
    }
    return out;
  }

  @Get('topic/:topic')
  async listByTopic(
    @Param('topic') topic: string,
    @Query('limit') limitStr?: string,
  ) {
    const limit = limitStr ? parseInt(limitStr, 10) : 20;
    const items = await this.kb.listByTopic(topic, limit);
    return { items, total: items.length, topic };
  }

  @Get('list')
  async listAll(
    @Query('limit') limitStr?: string,
    @Query('topic') topic?: string,
  ) {
    const limit = limitStr ? parseInt(limitStr, 10) : 50;
    const items = await this.kb.list(topic, limit);
    return { items, total: items.length };
  }

  @Get('stats')
  async stats() {
    return this.kb.getStats();
  }

  @Post('import')
  async importNow() {
    const stats = await this.kb.importFromJson();
    return { success: true, ...stats };
  }

  /**
   * 手动添加题到知识库
   * Body: { topic, title, body, tags?: string[], number?: number }
   */
  @Post('add')
  async add(@Body() body: {
    topic: string;
    title: string;
    body: string;
    tags?: string[];
    number?: number;
  }) {
    // 2026-06-28 fix：原代码 return {success:false} (HTTP 200) 违反 REST 约定。
    // 改成 BadRequestException 让客户端能正确处理 4xx 错误。
    if (!body.title || !body.body) {
      throw new BadRequestException('title 和 body 必填');
    }
    const id = `manual-${Date.now()}`;
    const item = {
      id,
      topic: body.topic || '手动添加',
      number: body.number ?? 0,
      title: body.title,
      body: body.body,
      tags: Array.isArray(body.tags) ? body.tags : [],
    };
    await this.kb.upsertItem(item);
    return { success: true, id, item };
  }

  /**
   * 召回率 benchmark
   * Body: { cases: [{ query, expectedItemIds: string[], topic?: string }], limit?: number, threshold?: number }
   * 返回 P@5 / P@10 / MRR / Recall@K
   */
  @Post('benchmark')
  async benchmark(
    @Body() body: {
      cases: Array<{ query: string; expectedItemIds: string[]; topic?: string }>;
      limit?: number;
      threshold?: number;
    },
  ) {
    const limit = body.limit ?? 5;
    const threshold = body.threshold ?? 0.6;
    const cases = body.cases || [];

    let p5 = 0, p10 = 0, mrrSum = 0, recall = 0;
    const details: any[] = [];

    for (const c of cases) {
      const hits = await this.kb.recall(c.query, { topic: c.topic, limit, threshold });
      const hitIds = hits.map((h) => h.item.id);
      let firstHitRank = -1;
      for (let i = 0; i < hitIds.length; i++) {
        if (c.expectedItemIds.includes(hitIds[i])) {
          if (firstHitRank < 0) firstHitRank = i + 1; // 1-based rank
        }
      }
      const isP5Hit = firstHitRank > 0 && firstHitRank <= 5;
      const isP10Hit = firstHitRank > 0 && firstHitRank <= 10;
      const mrr = firstHitRank > 0 ? 1 / firstHitRank : 0;
      const isRecallHit = firstHitRank > 0;
      if (isP5Hit) p5++;
      if (isP10Hit) p10++;
      mrrSum += mrr;
      if (isRecallHit) recall++;
      details.push({
        query: c.query,
        expected: c.expectedItemIds,
        gotIds: hitIds,
        scores: hits.map((h) => +h.score.toFixed(4)),
        firstHitRank,
        p5: isP5Hit,
        p10: isP10Hit,
        mrr: +mrr.toFixed(4),
      });
    }

    const total = cases.length || 1;
    return {
      totalCases: cases.length,
      limit,
      threshold,
      metrics: {
        precisionAt5: +(p5 / total).toFixed(4),
        precisionAt10: +(p10 / total).toFixed(4),
        meanReciprocalRank: +(mrrSum / total).toFixed(4),
        recall: +(recall / total).toFixed(4),
      },
      details,
    };
  }

  private buildDebugInfo(
    hits: KnowledgeSearchHit[],
    query: string,
    topic: string | undefined,
    limit: number,
    threshold: number,
    latencyMs: number,
  ): DebugInfo {
    const scores = hits.map((h) => h.score);
    const matchedFields: Record<string, number> = {};
    // 拆词：query 中文/英文混合都按词切
    const keywords = query
      .toLowerCase()
      .split(/[\s,，、。?？!！;；]+/)
      .filter((w) => w.length >= 2);
    for (const hit of hits) {
      const it = hit.item;
      const titleLower = it.title.toLowerCase();
      const bodyLower = it.body.toLowerCase();
      const tagLower = it.tags.map((t) => t.toLowerCase()).join(' ');
      const topicLower = it.topic.toLowerCase();
      // 关键词命中数 >= 1 才计
      const titleHit = keywords.some((k) => titleLower.includes(k));
      const bodyHit = keywords.some((k) => bodyLower.includes(k));
      const tagHit = keywords.some((k) => tagLower.includes(k));
      const topicHit = keywords.some((k) => topicLower.includes(k));
      if (titleHit) matchedFields['title'] = (matchedFields['title'] || 0) + 1;
      if (bodyHit) matchedFields['body'] = (matchedFields['body'] || 0) + 1;
      if (tagHit) matchedFields['tags'] = (matchedFields['tags'] || 0) + 1;
      if (topicHit) matchedFields['topic'] = (matchedFields['topic'] || 0) + 1;
    }
    const buckets = [
      { range: '[0.0, 0.3)', count: 0 },
      { range: '[0.3, 0.5)', count: 0 },
      { range: '[0.5, 0.7)', count: 0 },
      { range: '[0.7, 0.85)', count: 0 },
      { range: '[0.85, 1.0]', count: 0 },
    ];
    for (const s of scores) {
      if (s < 0.3) buckets[0].count++;
      else if (s < 0.5) buckets[1].count++;
      else if (s < 0.7) buckets[2].count++;
      else if (s < 0.85) buckets[3].count++;
      else buckets[4].count++;
    }
    return {
      query,
      topic,
      limit,
      threshold,
      totalCandidates: hits.length, // 当前已 filter 后的
      returnedCount: hits.length,
      filteredOut: 0, // Qdrant 已 server-side filter
      latencyMs,
      topScore: scores.length ? +Math.max(...scores).toFixed(4) : 0,
      minScore: scores.length ? +Math.min(...scores).toFixed(4) : 0,
      matchedFields,
      scoreDistribution: buckets,
    };
  }
}
