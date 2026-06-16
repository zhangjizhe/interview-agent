import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { BaseLLMProvider } from './base.provider';
import { ChatParams, ChatResponse, StreamChunk } from './types';

/**
 * 通义千问 Provider（OpenAI 兼容协议）
 */
@Injectable()
export class QwenProvider extends BaseLLMProvider {
  readonly name = 'qwen';
  readonly defaultModel: string;
  private client: OpenAI;
  private readonly logger = new Logger(QwenProvider.name);

  constructor(private config: ConfigService) {
    super();
    this.defaultModel = this.config.get<string>('qwen.model') || 'qwen-plus';
    this.client = new OpenAI({
      apiKey: this.config.get<string>('qwen.apiKey'),
      baseURL: this.config.get<string>('qwen.baseUrl'),
    });
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    try {
      const extraBody: Record<string, any> = {};
      // P0-1: 透传 prompt_cache_key 给 Qwen（OpenAI 兼容扩展）
      // 同时尝试 Qwen 自己的 cache_control 字段（DashScope 原生协议）
      if ((params as any).__promptCacheKey) {
        extraBody.prompt_cache_key = (params as any).__promptCacheKey;
        extraBody.user = (params as any).__promptCacheKey;
      }
      // 如果 messages 里有 cache_control 标记，提取到顶层
      const cacheableIndices = (params as any).__cacheableIndices as number[] | undefined;
      let messages = params.messages as any[];
      if (cacheableIndices && cacheableIndices.length > 0) {
        messages = messages.map((m, i) => {
          if (!cacheableIndices.includes(i)) return m;
          if (typeof m.content === 'string') {
            return {
              ...m,
              content: [
                { type: 'text', text: m.content, cache_control: { type: 'ephemeral' } },
              ],
            };
          }
          return m;
        });
      }

      const response = await this.client.chat.completions.create({
        model: this.defaultModel,
        messages: messages as any,
        temperature: params.temperature ?? 0.7,
        max_tokens: params.maxTokens,
        tools: params.tools as any,
        tool_choice: params.toolChoice as any,
        stream: false,
        ...(Object.keys(extraBody).length > 0 ? { ...extraBody } : {}),
      } as any);

      const choice = response.choices[0];
      return {
        content: choice.message.content || '',
        usage: {
          promptTokens: response.usage?.prompt_tokens || 0,
          completionTokens: response.usage?.completion_tokens || 0,
        },
        finishReason: choice.finish_reason || 'stop',
        model: response.model,
      };
    } catch (err) {
      this.logger.error(`Qwen chat failed: ${err.message}`);
      throw err;
    }
  }

  async *streamChat(params: ChatParams): AsyncGenerator<StreamChunk, void, void> {
    try {
      const extraBody: Record<string, any> = {};
      if ((params as any).__promptCacheKey) {
        extraBody.prompt_cache_key = (params as any).__promptCacheKey;
        extraBody.user = (params as any).__promptCacheKey;
      }
      const stream = await this.client.chat.completions.create({
        model: this.defaultModel,
        messages: params.messages as any,
        temperature: params.temperature ?? 0.7,
        max_tokens: params.maxTokens,
        tools: params.tools as any,
        tool_choice: params.toolChoice as any,
        stream: true,
        stream_options: { include_usage: true },
        ...(Object.keys(extraBody).length > 0 ? { ...extraBody } : {}),
      } as any);

      for await (const chunk of stream as any) {
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          yield { content: delta.content };
        }
        if (chunk.choices[0]?.finish_reason) {
          yield { finishReason: chunk.choices[0].finish_reason as any };
        }
        if (chunk.usage) {
          yield {
            usage: {
              promptTokens: chunk.usage.prompt_tokens,
              completionTokens: chunk.usage.completion_tokens,
            },
          };
        }
      }
    } catch (err) {
      this.logger.error(`Qwen stream failed: ${err.message}`);
      yield { finishReason: 'error' };
      throw err;
    }
  }
}
