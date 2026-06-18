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
  }

  get lc_serializable() {
    return false;
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
      if (m._getType() === 'system') return { role: 'system' as const, content };
      if (m._getType() === 'human') return { role: 'user' as const, content };
      if (m._getType() === 'ai') return { role: 'assistant' as const, content };
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
}
