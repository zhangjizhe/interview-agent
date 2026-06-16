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
}

export interface ChatResponse {
  content: string;
  usage: { promptTokens: number; completionTokens: number };
  finishReason: string;
  model: string;
}

export type LLMProviderName = 'qwen' | 'deepseek';
