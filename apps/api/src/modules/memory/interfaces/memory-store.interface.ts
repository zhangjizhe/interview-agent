export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
}

export interface Memory {
  id: string;
  content: string;
  score?: number;
  metadata?: Record<string, any>;
  createdAt?: Date;
  timestamp?: number;
}

export interface MemoryStore {
  // 短期记忆 - Redis
  appendMessage(sessionId: string, msg: ChatMessage): Promise<void>;
  getRecentMessages(sessionId: string, limit?: number): Promise<ChatMessage[]>;
  clearSession(sessionId: string): Promise<void>;

  // 长期记忆 - Mem0
  recall(userId: string, query: string, limit?: number): Promise<Memory[]>;
  memorize(userId: string, messages: ChatMessage[]): Promise<void>;
}

export const MEMORY_STORE = Symbol('MEMORY_STORE');
