/**
 * LlmGatewayChatModel - LangChain BaseChatModel 适配器
 *
 * 目的：让 LangGraph 节点能透明地走 LlmGatewayService
 * 收益：multi 模式也能享受缓存、降级、成本追踪
 *
 * 实现：
 * - 继承 BaseChatModel
 * - _generate() 内部调 this.llm.chat()
 * - 这样 LangChain 的 model.invoke() 实际是调 LlmGateway
 */
import { BaseChatModel, type BaseChatModelParams } from '@langchain/core/language_models/chat_models';
import {
  AIMessage,
  BaseMessage,
  ChatMessage,
  HumanMessage,
  SystemMessage,
  type MessageContent,
  type MessageContentText,
} from '@langchain/core/messages';
import { ChatResult } from '@langchain/core/outputs';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import type { LlmGatewayService } from '../../modules/llm/llm.gateway.service';

export interface LlmGatewayChatModelFields extends BaseChatModelParams {
  llmGateway: LlmGatewayService;
  provider: 'qwen' | 'deepseek';
  interviewId?: string;
  userId?: string;
}

export class LlmGatewayChatModel extends BaseChatModel {
  lc_namespace = ['interview-agent', 'custom'];

  private llmGateway: LlmGatewayService;
  private provider: 'qwen' | 'deepseek';
  private interviewId: string;
  private userId: string;

  constructor(fields: LlmGatewayChatModelFields) {
    super(fields);
    this.llmGateway = fields.llmGateway;
    this.provider = fields.provider;
    this.interviewId = fields.interviewId || 'unknown';
    this.userId = fields.userId || 'anonymous';

    // LangChain v1.x：父类 lc_serializable 是 property，子类 override 必须用同样的方式
    // 用 defineProperty 在实例上覆盖，避免 TS2611 冲突
    Object.defineProperty(this, 'lc_serializable', {
      value: false,
      writable: true,
      configurable: true,
    });
  }

  getModelName(): string {
    return this.provider;
  }

  /**
   * LangChain 内部调这个方法生成内容
   * 这里转给 LlmGateway，承接缓存、降级、成本埋点
   */
  async _generate(
    messages: BaseMessage[],
    _options: this['ParsedCallOptions'],
    _runManager?: CallbackManagerForLLMRun,
  ): Promise<ChatResult> {
    const gatewayMessages = messages.map((m) => {
      const content = typeof m.content === 'string' ? m.content : this.extractText(m.content);
      // LangChain v1.x: _getType() → getType() (private → public)
      const mtype = m.getType ? m.getType() : (m as any)._getType?.();
      if (mtype === 'system') return { role: 'system' as const, content };
      if (mtype === 'human') return { role: 'user' as const, content };
      if (mtype === 'ai') return { role: 'assistant' as const, content };
      return { role: 'user' as const, content };
    });

    const response = await this.llmGateway.chat(
      {
        messages: gatewayMessages,
        interviewId: this.interviewId,
        userId: this.userId,
      },
      this.provider,
    );

    const aiMessage = new AIMessage(response.content);
    return {
      generations: [
        {
          text: response.content,
          message: aiMessage,
        },
      ],
      llmOutput: {
        tokenUsage: response.usage,
        model_name: response.model,
        finish_reason: response.finishReason,
      },
    };
  }

  private extractText(content: MessageContent): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .map((c) => (typeof c === 'string' ? c : (c as MessageContentText).text || ''))
        .join('');
    }
    return (content as MessageContentText).text || '';
  }

  _llmType(): string {
    return 'llm-gateway';
  }

  /**
   * LangChain v1.x 的 withStructuredOutput 走 tool calling 路径时需要 model.bindTools()
   * LlmGateway 本身不暴露 tool calling，所以重写 withStructuredOutput 让它走 prompt-based JSON 路径：
   * 1. 调 _generate 拿到 LLM 完整 content
   * 2. 用 safeJsonParse 解析成对象
   * 3. 用 zod schema 验证
   *
   * 这样 LangGraph 的 supervisor/planner/reviewer 用 `model.withStructuredOutput(zodSchema).invoke(...)` 时
   * 不用管 tool calling 细节，LlmGateway 当作纯 prompt-based JSON 模型用。
   */
  withStructuredOutput(schema: any, _options?: any): any {
    const model = this;
    const executor = {
      async invoke(input: any): Promise<any> {
        const messages = Array.isArray(input) ? input : [input];
        const result = await model._generate(messages, {});
        const text = result.generations[0]?.text ?? '';
        // 尝试从 LLM 输出提取 JSON（支持 markdown code fence）
        const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
        try {
          const parsed = JSON.parse(cleaned);
          // zod 验证（如果有 schema.parse）
          if (schema && typeof schema.parse === 'function') {
            return schema.parse(parsed);
          }
          return parsed;
        } catch (err: any) {
          throw new Error(
            `withStructuredOutput: failed to parse LLM output as JSON.\n` +
            `Output: ${text.slice(0, 500)}\n` +
            `Parse error: ${err.message}`,
          );
        }
      },
      async stream(_input: any): Promise<any> {
        throw new Error('withStructuredOutput.stream not supported on LlmGatewayChatModel');
      },
    };
    return executor;
  }
}
