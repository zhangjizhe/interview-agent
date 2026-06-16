import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { BaseLLMProvider } from './base.provider';
import { ChatParams, ChatResponse, StreamChunk } from './types';

/**
 * DeepSeek Provider（OpenAI 兼容协议）
 */
@Injectable()
export class DeepseekProvider extends BaseLLMProvider {
  readonly name = 'deepseek';
  readonly defaultModel: string;
  private client: OpenAI;
  private readonly logger = new Logger(DeepseekProvider.name);

  constructor(private config: ConfigService) {
    super();
    this.defaultModel = this.config.get<string>('deepseek.model') || 'deepseek-chat';
    this.client = new OpenAI({
      apiKey: this.config.get<string>('deepseek.apiKey'),
      baseURL: this.config.get<string>('deepseek.baseUrl'),
    });
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    try {
      const extraBody: Record<string, any> = {};
      // P0-1: 透传 prompt_cache_key 给 DeepSeek（cache hit 价格 1/10）
      if ((params as any).__promptCacheKey) {
        extraBody.prompt_cache_key = (params as any).__promptCacheKey;
        extraBody.user = (params as any).__promptCacheKey;
      }
      const response = await this.client.chat.completions.create({
        model: this.defaultModel,
        messages: params.messages as any,
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
      this.logger.error(`DeepSeek chat failed: ${err.message}`);
      throw err;
    }
  }

  async *streamChat(params: ChatParams): AsyncGenerator<StreamChunk, void, void> {
    try {
      const stream = await this.client.chat.completions.create({
        model: this.defaultModel,
        messages: params.messages as any,
        temperature: params.temperature ?? 0.7,
        max_tokens: params.maxTokens,
        tools: params.tools as any,
        tool_choice: params.toolChoice as any,
        stream: true,
      });

      for await (const chunk of stream) {
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
      this.logger.error(`DeepSeek stream failed: ${err.message}`);
      yield { finishReason: 'error' };
      throw err;
    }
  }
}
