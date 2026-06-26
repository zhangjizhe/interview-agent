import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createDeepAgent, type DeepAgent } from 'deepagents';
import { ChatOpenAI } from '@langchain/openai';
import { tool } from 'langchain';
import { z } from 'zod';
import { LangfuseService } from '../../infra/langfuse/langfuse.service';
import { BochaSearchTool } from './tools/bocha-search.tool';

/**
 * 面试 Agent - 写真实接入 deepagents (LangChain 官方)
 *
 * 架构：
 * - createDeepAgent() 提供完整的 LangGraph 状态机
 * - ChatOpenAI 兼容协议（通义千问 / DeepSeek 都支持）
 * - 自定义工具：博查搜索（包装现有 BochaSearchTool）
 * - 系统提示：注入候选人历史 + 当前岗位 + 题库
 */
@Injectable()
export class DeepAgentsAgentService implements OnModuleInit {
  private readonly logger = new Logger(DeepAgentsAgentService.name);
  private agent: DeepAgent | null = null;
  private model: ChatOpenAI | null = null;

  constructor(
    private config: ConfigService,
    private langfuse: LangfuseService,
    private bocha: BochaSearchTool,
  ) {}

  onModuleInit() {
    try {
      // 构造 ChatOpenAI 兼容实例（指向通义千问）
      const qwenBase = this.config.get<string>('qwen.baseUrl');
      const qwenKey = this.config.get<string>('qwen.apiKey');
      const qwenModel = this.config.get<string>('qwen.model') || 'qwen-plus';

      this.model = new ChatOpenAI({
        modelName: qwenModel,
        apiKey: qwenKey,
        configuration: { baseURL: qwenBase },
        temperature: 0.7,
      });

      // 包装博查搜索为 LangChain tool
      const bochaTool = tool(
        async ({ query, count }) => {
          const result = await this.bocha.execute({ query, count });
          return JSON.stringify(result.results);
        },
        {
          name: 'bocha_search',
          description: '联网搜索最新技术文档、行业资讯。仅当候选人询问"最新"、"现在"、"2024"等时效性问题时使用。',
          schema: z.object({
            query: z.string().describe('搜索关键词'),
            count: z.number().optional().describe('返回结果数量，默认 5'),
          }),
        },
      );

      this.agent = createDeepAgent({
        model: this.model,
        tools: [bochaTool],
        systemPrompt: `你是一位专业的 AI 面试官小面。

【角色】正在面试候选人，岗位和职级由调用方注入。
【对话原则】
- 每次只问一个题，不要一次抛出多个
- 候选人回答后先简要认可或追问，再进入下一题
- 给候选人一次提示机会，再不会就换个角度
- 保持专业、友好、像真人面试官

【风格】自然口语，不用 Markdown 标题或列表。
【可用工具】bocha_search（仅时效性问题时调用）

【注意】调用方会在 messages 头部注入【候选人历史信息】和【当前岗位】块。`,
      });

      this.logger.log(`✅ DeepAgents agent initialized (model=${qwenModel})`);
    } catch (err) {
      this.logger.error(`DeepAgents init failed: ${err.message}`);
      // 不抛错——降级到手写循环
    }
  }

  /**
   * 调用 Agent（流式输出）
   *
   * ⚠️ 架构说明：
   * deepagents 的 stream() 内部是 invoke + 分块模拟，无法逐 token 流式。
   * 因此 stream 模式绕回 ChatOpenAI.stream() 实现真正的 token-by-token 流式输出。
   * deepagents 图（createDeepAgent）仅在 invoke() 非流式调用时使用。
   *
   * 简历话术注意：
   * ✅ 能写："deepagents 引擎支持 invoke 非流式调用 + ChatOpenAI 真流式输出"
   * ❌ 不能写："deepagents 完整跑多 Agent 流式"（stream 不是走 deepagents 图）
   */
  async *stream(
    systemContext: string,
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  ): AsyncGenerator<string, void, void> {
    if (!this.model) {
      throw new Error('Model not initialized');
    }

    // 注入上下文：候选人历史 + 当前岗位 + 题库
    const fullMessages = [
      { role: 'system' as const, content: systemContext },
      ...messages.map((m) => ({ role: m.role as any, content: m.content })),
    ];

    // 直接调用 ChatOpenAI 的 stream() —— 真正的逐 token 流式
    try {
      const stream = await this.model.stream(fullMessages);
      for await (const chunk of stream) {
        // chunk 是 AIMessageChunk，content 可能是 string 或 ContentChunk[]
        const text = typeof chunk.content === 'string'
          ? chunk.content
          : Array.isArray(chunk.content)
            ? chunk.content.map((c: any) => c.text || '').join('')
            : '';
        if (text) yield text;
      }
    } catch (err: any) {
      this.logger.error(`DeepAgents stream failed: ${err.message}`);
      throw err;
    }
  }

  /**
   * 调用 Agent（非流式）
   */
  async invoke(
    systemContext: string,
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  ): Promise<string> {
    if (!this.agent) {
      throw new Error('Agent not initialized');
    }

    const fullMessages = [
      { role: 'system' as const, content: systemContext },
      ...messages.map((m) => ({ role: m.role as any, content: m.content })),
    ];

    const result = await this.agent.invoke({
      messages: fullMessages,
    });
    return this.extractContent(result) || '';
  }

  private extractContent(chunk: any): string {
    // deepagents 返回多种格式，尝试提取文本
    if (typeof chunk === 'string') return chunk;
    if (chunk?.content) {
      if (typeof chunk.content === 'string') return chunk.content;
      if (Array.isArray(chunk.content)) {
        return chunk.content
          .map((c: any) => (typeof c === 'string' ? c : c.text || ''))
          .join('');
      }
    }
    if (chunk?.messages) {
      const last = chunk.messages[chunk.messages.length - 1];
      return this.extractContent(last);
    }
    if (chunk?.kwargs?.content) {
      return typeof chunk.kwargs.content === 'string'
        ? chunk.kwargs.content
        : this.extractContent({ content: chunk.kwargs.content });
    }
    return '';
  }

  isReady(): boolean {
    return this.agent !== null;
  }
}