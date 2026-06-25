export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: any; // JSON Schema
  };
}

export interface ChatParams {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  tools?: ToolDefinition[];
  toolChoice?: 'auto' | 'none' | 'required';
  traceId?: string;  // Langfuse trace ID
}

export interface StreamChunk {
  content?: string;
  finishReason?: 'stop' | 'length' | 'tool_calls' | 'error';
  usage?: { promptTokens: number; completionTokens: number };
  toolCall?: {
    id: string;
    name: string;
    arguments: string;
  };
  /**
   * 标记 chunk 是 fallback 切换提示（非模型输出）。修复 P0-8：
   * 流式 primary 失败切换 fallback 时已 yield 的 chunk 收不回，此 marker 让
   * 消费者能识别内容不连续（例如前端可显示"主 provider 异常已切换"提示，
   * 而不是看到"半截主 + 完整 fallback"的拼接脏数据）。
   *
   * 注意：消费方 multi-agent.service 暂不处理该字段（向后兼容），未来可在
   * SSE 推送给前端时单独 emit 一个 `event: fallback`。
   */
  isFallbackMarker?: boolean;
}

export interface ChatResponse {
  content: string;
  usage: { promptTokens: number; completionTokens: number };
  finishReason: string;
  model: string;
}

export type LLMProviderName = 'qwen' | 'deepseek';
