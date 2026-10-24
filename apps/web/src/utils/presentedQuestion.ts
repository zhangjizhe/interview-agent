export interface PresentedQuestion {
  presentationId: string;
  taskId: string;
  messageId: string;
  question: string;
  state: 'OPEN' | 'PROCESSING' | 'UNKNOWN';
}

export function readPresentedQuestion(value: unknown): PresentedQuestion | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (!['presentationId', 'taskId', 'messageId', 'question'].every(key => typeof row[key] === 'string' && (row[key] as string).trim())
    || typeof row.state !== 'string' || !['OPEN', 'PROCESSING', 'UNKNOWN'].includes(String(row.state))) return null;
  return { presentationId: row.presentationId as string, taskId: row.taskId as string, messageId: row.messageId as string, question: row.question as string, state: row.state as PresentedQuestion['state'] };
}
