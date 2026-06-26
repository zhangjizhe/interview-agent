/**
 * GitHub 集成工具 - 让 Agent 能查询候选人 GitHub 公开仓库
 *
 * 3 个 tools:
 * - github_get_user: 用户公开信息（粉丝数、贡献统计）
 * - github_list_repos: 仓库列表（按 stars 排序）
 * - github_get_readme: 仓库 README 内容
 *
 * 用法场景：面试官评估候选人时，让 agent 读候选人 GitHub 仓库代码作为真实材料，
 *          而不是只看简历
 *
 * Rate limit: 未认证 60 req/h；带 GITHUB_TOKEN 5000 req/h
 *
 * 设计原则：
 * - 不依赖 OAuth：只读公开数据，无需用户授权
 * - 失败降级：API 调用失败返回结构化错误，agent 能告诉用户"GitHub 不可用"
 * - 限流友好：带 If-None-Match / ETag 缓存（TODO 未来迭代）
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ToolDefinition } from '../../llm/providers/types';

const GITHUB_API_BASE = 'https://api.github.com';

export interface GitHubUser {
  login: string;
  name: string | null;
  bio: string | null;
  company: string | null;
  location: string | null;
  public_repos: number;
  followers: number;
  following: number;
  created_at: string;
  html_url: string;
}

export interface GitHubRepo {
  name: string;
  full_name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  updated_at: string;
  html_url: string;
  topics: string[];
}

export interface GitHubReadme {
  repo: string;
  content: string; // base64 decoded markdown
  size: number;
  /** true if content was truncated due to MAX_README_SIZE */
  truncated?: boolean;
}

@Injectable()
export class GitHubTool {
  private readonly logger = new Logger(GitHubTool.name);
  private token: string | null = null;

  constructor(private config: ConfigService) {
    this.token = this.config.get<string>('github.token') || null;
  }

  /**
   * 工具定义集合（3 个独立 tools，可被 McpRegistry 单独注册）
   */
  static readonly definitions: ToolDefinition[] = [
    {
      type: 'function',
      function: {
        name: 'github_get_user',
        description: '查询 GitHub 用户的公开信息（粉丝数、仓库数、bio 等）。用于面试场景中评估候选人 GitHub 活跃度。',
        parameters: {
          type: 'object',
          properties: {
            username: { type: 'string', description: 'GitHub 用户名（如 zhangjizhe）' },
          },
          required: ['username'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'github_list_repos',
        description: '列出 GitHub 用户的公开仓库，按 stars 降序。用于评估候选人的开源贡献和技术栈。',
        parameters: {
          type: 'object',
          properties: {
            username: { type: 'string', description: 'GitHub 用户名' },
            sort: {
              type: 'string',
              enum: ['stars', 'updated', 'created'],
              description: '排序字段，默认 stars',
              default: 'stars',
            },
            limit: { type: 'number', description: '返回数量（1-30），默认 10', default: 10 },
          },
          required: ['username'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'github_get_readme',
        description: '获取仓库 README 内容（Markdown 格式），用于深入评估候选人的项目质量。',
        parameters: {
          type: 'object',
          properties: {
            owner: { type: 'string', description: '仓库 owner（如 zhangjizhe）' },
            repo: { type: 'string', description: '仓库名（如 interview-agent）' },
          },
          required: ['owner', 'repo'],
        },
      },
    },
  ];

  private async fetchJson<T>(path: string): Promise<T> {
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'interview-agent',
    };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    // R-P2-4 修复：fetch 加 AbortController 超时控制（默认 15s）
    // 原代码无超时，GitHub API 限流 / 慢响应时阻塞 Agent 主流程。
    const TIMEOUT_MS = 15000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const url = `${GITHUB_API_BASE}${path}`;
      const response = await fetch(url, { headers, signal: controller.signal });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`GitHub API ${response.status}: ${text.slice(0, 200)}`);
      }
      return response.json() as Promise<T>;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async getUser(args: { username: string }): Promise<GitHubUser> {
    return this.fetchJson<GitHubUser>(`/users/${encodeURIComponent(args.username)}`);
  }

  async listRepos(args: { username: string; sort?: string; limit?: number }): Promise<GitHubRepo[]> {
    const sort = args.sort || 'stars';
    const perPage = Math.min(Math.max(args.limit || 10, 1), 30);
    const repos = await this.fetchJson<GitHubRepo[]>(
      `/users/${encodeURIComponent(args.username)}/repos?sort=${sort}&per_page=${perPage}&type=owner`,
    );
    return repos;
  }

  async getReadme(args: { owner: string; repo: string }): Promise<GitHubReadme> {
    const fullName = `${args.owner}/${args.repo}`;
    const data = await this.fetchJson<{ content: string; encoding: string; size: number }>(
      `/repos/${encodeURIComponent(args.owner)}/${encodeURIComponent(args.repo)}/readme`,
    );
    // R-P2-6 修复：README 截断到 100KB，防止超大文件（如 1MB README）导致内存峰值。
    // GitHub base64 解码后 UTF-8 文本可能数倍膨胀，提前截断避免 OOM。
    const MAX_README_SIZE = 100 * 1024;
    const decoded = data.encoding === 'base64'
      ? Buffer.from(data.content, 'base64').toString('utf8').slice(0, MAX_README_SIZE)
      : data.content.slice(0, MAX_README_SIZE);
    return { repo: fullName, content: decoded, size: data.size, truncated: data.size > MAX_README_SIZE };
  }

  /**
   * 统一执行入口（被 multi-agent.service.bindTools 调用）
   */
  async execute(toolName: string, args: any): Promise<any> {
    switch (toolName) {
      case 'github_get_user':
        return this.getUser(args);
      case 'github_list_repos':
        return this.listRepos(args);
      case 'github_get_readme':
        return this.getReadme(args);
      default:
        throw new Error(`Unknown GitHub tool: ${toolName}`);
    }
  }
}