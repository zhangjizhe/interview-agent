/**
 * Notion 集成工具 - 让 Agent 读候选人 Notion 文档（如技术博客 / 学习笔记）
 *
 * 3 个 tools:
 * - notion_search: 全文搜索（按 query 匹配 page title 或 content）
 * - notion_get_page: 获取页面详情（properties + content blocks）
 * - notion_list_databases: 列出用户所有 databases
 *
 * 用法场景：候选人把"项目复盘" / "技术学习笔记" 存在 Notion，
 *          面试时 agent 可以读这些作为真实材料
 *
 * API 文档：https://developers.notion.com/reference/
 *
 * 认证：Notion Internal Integration Token
 *   1. 访问 https://www.notion.so/my-integrations 创建 integration
 *   2. 复制 "Internal Integration Token"
 *   3. 在 Notion 工作区里把需要访问的页面"Add connections"分享给 integration
 *   4. 把 token 配置到 .env: NOTION_TOKEN=secret_xxx
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ToolDefinition } from '../../llm/providers/types';

const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

export interface NotionPage {
  id: string;
  title: string;
  url: string;
  properties: Record<string, any>;
  lastEditedTime: string;
  excerpt?: string;
}

export interface NotionSearchResult {
  pages: NotionPage[];
  total: number;
}

export interface NotionPageContent {
  id: string;
  title: string;
  url: string;
  /** Markdown 渲染的内容（简化版） */
  markdown: string;
  /** 原始 blocks */
  blockCount: number;
}

@Injectable()
export class NotionTool {
  private readonly logger = new Logger(NotionTool.name);
  private token: string | null = null;

  constructor(private config: ConfigService) {
    this.token = this.config.get<string>('notion.token') || null;
    if (!this.token) {
      this.logger.warn('Notion token not configured (NOTION_TOKEN) — tools will return errors');
    }
  }

  static readonly definitions: ToolDefinition[] = [
    {
      type: 'function',
      function: {
        name: 'notion_search',
        description: '在 Notion 工作区全文搜索页面。按 query 匹配页面标题或内容，返回相关页面列表。',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '搜索关键词（中文/英文都可）' },
            limit: { type: 'number', description: '返回数量（1-50），默认 10', default: 10 },
          },
          required: ['query'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'notion_get_page',
        description: '获取 Notion 页面详情（properties + 文本内容，markdown 格式）。',
        parameters: {
          type: 'object',
          properties: {
            page_id: { type: 'string', description: 'Notion 页面 ID（UUID 格式）' },
          },
          required: ['page_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'notion_list_databases',
        description: '列出当前 integration 可访问的所有 databases。',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    },
  ];

  private async fetchJson<T>(path: string, body?: any): Promise<T> {
    if (!this.token) {
      throw new Error('Notion token not configured (set NOTION_TOKEN in .env)');
    }
    const response = await fetch(`${NOTION_API_BASE}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Notion API ${response.status}: ${text.slice(0, 200)}`);
    }
    return response.json() as Promise<T>;
  }

  /**
   * 提取页面标题（Notion title 字段的格式：{ [propName]: { title: [{ plain_text }] } }）
   */
  private extractTitle(page: any): string {
    const props = page.properties || {};
    for (const key of Object.keys(props)) {
      const prop = props[key];
      if (prop?.type === 'title' && Array.isArray(prop.title)) {
        return prop.title.map((t: any) => t.plain_text || '').join('');
      }
    }
    return '(untitled)';
  }

  async search(args: { query: string; limit?: number }): Promise<NotionSearchResult> {
    const limit = Math.min(Math.max(args.limit || 10, 1), 50);
    const result = await this.fetchJson<any>('/search', {
      query: args.query,
      page_size: limit,
      filter: { property: 'object', value: 'page' },
    });

    const pages: NotionPage[] = (result.results || []).map((p: any) => ({
      id: p.id,
      title: this.extractTitle(p),
      url: p.url,
      properties: p.properties,
      lastEditedTime: p.last_edited_time,
    }));

    return { pages, total: pages.length };
  }

  async getPage(args: { page_id: string }): Promise<NotionPageContent> {
    // 1. 拿 page metadata
    const page = await this.fetchJson<any>(`/pages/${args.page_id}`);
    const title = this.extractTitle(page);

    // 2. 拿 page blocks
    const blocksRes = await this.fetchJson<any>(`/blocks/${args.page_id}/children?page_size=100`);
    const blocks = blocksRes.results || [];

    // 3. 把 blocks 转 markdown（简化版：只处理 paragraph / heading / bulleted_list）
    const markdown = this.blocksToMarkdown(blocks);

    return {
      id: page.id,
      title,
      url: page.url,
      markdown,
      blockCount: blocks.length,
    };
  }

  async listDatabases(): Promise<NotionPage[]> {
    const result = await this.fetchJson<any>('/search', {
      query: '',
      filter: { property: 'object', value: 'database' },
    });

    return (result.results || []).map((db: any) => ({
      id: db.id,
      title: db.title?.[0]?.plain_text || '(untitled database)',
      url: db.url,
      properties: db.properties,
      lastEditedTime: db.last_edited_time,
    }));
  }

  /**
   * 简化版 blocks → markdown 渲染
   * 只处理 paragraph / heading_1/2/3 / bulleted_list_item / numbered_list_item
   */
  private blocksToMarkdown(blocks: any[]): string {
    const lines: string[] = [];
    for (const block of blocks) {
      const text = (block[block.type]?.rich_text || [])
        .map((t: any) => t.plain_text || '')
        .join('');

      switch (block.type) {
        case 'heading_1': lines.push(`# ${text}`); break;
        case 'heading_2': lines.push(`## ${text}`); break;
        case 'heading_3': lines.push(`### ${text}`); break;
        case 'bulleted_list_item': lines.push(`- ${text}`); break;
        case 'numbered_list_item': lines.push(`1. ${text}`); break;
        case 'paragraph':
        default: lines.push(text);
      }
    }
    return lines.join('\n');
  }

  /**
   * 统一执行入口（被 multi-agent.service.bindTools 调用）
   */
  async execute(toolName: string, args: any): Promise<any> {
    switch (toolName) {
      case 'notion_search':
        return this.search(args);
      case 'notion_get_page':
        return this.getPage(args);
      case 'notion_list_databases':
        return this.listDatabases();
      default:
        throw new Error(`Unknown Notion tool: ${toolName}`);
    }
  }
}