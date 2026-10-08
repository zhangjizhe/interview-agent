export interface AgentStreamEvent {
  type: string;
  content?: string;
  error?: string;
}

export interface CandidateStreamEvent {
  type: 'token' | 'error';
  content?: string;
  error?: string;
}

export function toCandidateStreamEvent(event: AgentStreamEvent): CandidateStreamEvent | null {
  if (event.type === 'token' && event.content) {
    return { type: 'token', content: event.content };
  }
  if (event.type === 'error') {
    return { type: 'error', error: '当前回答暂时无法处理，请稍后重试。' };
  }
  return null;
}
