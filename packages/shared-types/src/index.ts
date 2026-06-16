export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
}

export interface Interview {
  id: string;
  userId: string;
  position: string;
  level: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';
  startedAt: string;
  endedAt?: string;
  summary?: string;
}

export interface Report {
  id: string;
  interviewId: string;
  overallScore: number;
  scores: {
    technical: number;
    communication: number;
    logic: number;
    learning: number;
  };
  strengths: string;
  weaknesses: string;
  suggestions: string;
  createdAt: string;
  // 端接口补充字段
  totalTokens?: number;
  // 面试者信息（end 接口扩展）
  candidate?: {
    userId: string;
    name: string;
    position: string;
    level: string;
    startedAt: string;
    endedAt: string;
    durationMin: number;
    messageCount: number;
    resumeName: string | null;
    resumeSkills: string | null;
  };
}

export interface AgentEvent {
  type: 'token' | 'tool_call' | 'tool_result' | 'done' | 'error' | 'token_usage';
  content?: string;
  toolName?: string;
  toolResult?: any;
  error?: string;
  promptTokens?: number;
  completionTokens?: number;
  total?: number;
}

export interface McpToolMeta {
  name: string;
  displayName: string;
  description: string;
  emoji: string;
  category: 'search' | 'knowledge' | 'code' | 'mcp' | 'custom';
  enabled: boolean;
  author?: string;
  version?: string;
}

export interface ToolsListResponse {
  tools: McpToolMeta[];
  count: number;
  enabledCount: number;
}
