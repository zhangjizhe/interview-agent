import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ToolDefinition } from '../../llm/providers/types';


export interface BochaSearchResult {
  title: string;
  url: string;
  snippet: string;
  datePublished?: string;
}

export interface BochaSearchResponse {
  results: BochaSearchResult[];
  query: string;
}

/**
 * 博查搜索工具 - 让 Agent 能联网获取最新信息
 */
@Injectable()
export class BochaSearchTool {
  private readonly logger = new Logger(BochaSearchTool.name);
  private apiKey: string;
  private baseUrl: string;

  constructor(private config: ConfigService) {
    this.apiKey = this.config.get<string>('bocha.apiKey');
    this.baseUrl = this.config.get<string>('bocha.baseUrl');
  }

  /**
   * 工具定义（给 LLM 看）
   */
  static readonly definition: ToolDefinition = {
    type: 'function',
    function: {
      name: 'bocha_search',
      description: '联网搜索最新信息。当遇到不确定的最新技术、行业动态、岗位要求等问题时调用此工具。',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜索关键词',
          },
          count: {
            type: 'number',
            description: '返回结果数量，默认 5',
            default: 5,
          },
        },
        required: ['query'],
      },
    },
  };

  /**
   * 执行搜索
   */
  async execute(args: { query: string; count?: number }): Promise<BochaSearchResponse> {
    if (!this.apiKey) {
      this.logger.warn('Bocha API key not configured');
      return { results: [], query: args.query };
    }

    try {
      const response = await fetch(`${this.baseUrl}/web-search`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: args.query,
          summary: true,
          count: args.count || 5,
        }),
      });

      if (!response.ok) {
        throw new Error(`Bocha API error: ${response.status}`);
      }

      const data = await response.json();
      const results = (data.data?.webPages?.value || []).map((item: any) => ({
        title: item.name,
        url: item.url,
        snippet: item.snippet,
        datePublished: item.datePublished,
      }));

      return { results, query: args.query };
    } catch (err) {
      this.logger.error(`Bocha search failed: ${err.message}`);
      return { results: [], query: args.query };
    }
  }
}
