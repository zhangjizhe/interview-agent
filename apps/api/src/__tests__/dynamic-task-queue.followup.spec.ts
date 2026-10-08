jest.mock('../modules/llm/llm.gateway.service', () => ({ LlmGatewayService: class {} }));
jest.mock('../modules/interview/services/question-bank.service', () => ({ QuestionBankService: class {} }));
import { DynamicTaskQueueService } from '../modules/interview/services/dynamic-task-queue.service';

describe('follow-up decisions persist through the current routing rules', () => {
  const task = { id: 'task', interviewId: 'fixture', type: 'QUESTION', status: 'COMPLETED', question: 'Explain React state', category: 'frontend', difficulty: 'medium', context: {} };
  let prisma: any, llm: any, service: DynamicTaskQueueService;
  beforeEach(() => {
    prisma = { interviewTask: { findUnique: jest.fn().mockResolvedValue(task), findMany: jest.fn().mockResolvedValue([task]), update: jest.fn(), create: jest.fn() },
      interviewQuestion: { findUnique: jest.fn().mockResolvedValue({ id: 'question' }) }, answerHistory: { create: jest.fn().mockResolvedValue({ id: 'history' }) } };
    prisma.$transaction = jest.fn(async work => work(prisma));
    llm = { chat: jest.fn().mockResolvedValue({ content: JSON.stringify({ score: 0.3, completeness: 0.3, correctness: 0.3, depth: 0.3, feedback: 'Synthetic gap', keyPoints: [], missingPoints: ['constraints'], shouldFollowUp: true, followUpQuestion: 'Explain a constraint', followUpReason: 'Missing evidence', shouldAdvance: false, advancedQuestion: null }) }) };
    service = new DynamicTaskQueueService(prisma, llm);
  });
  it('persists low-score evidence and creates a follow-up with its parent task', async () => {
    await service.completeTask('fixture', 'fixture-user', 'task', 'Synthetic answer');
    expect(prisma.answerHistory.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ questionId: 'question', score: 0.3 }) }));
    expect(prisma.interviewTask.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: 'FOLLOW_UP', question: 'Explain a constraint' }) }));
    expect(JSON.parse(prisma.interviewTask.create.mock.calls[0][0].data.context).followUpFrom).toBe('task');
  });
  it('does not duplicate an existing follow-up or overflow a full queue', async () => {
    prisma.interviewTask.findMany.mockResolvedValue([task, { ...task, id: 'existing-followup', type: 'FOLLOW_UP', status: 'PENDING', context: { followUpFrom: 'task' } }]);
    await service.completeTask('fixture', 'fixture-user', 'task', 'Synthetic answer');
    expect(prisma.interviewTask.create).not.toHaveBeenCalled();
    prisma.interviewTask.findMany.mockResolvedValue([task, ...Array.from({ length: 8 }, (_, index) => ({ ...task, id: `pending-${index}`, status: 'PENDING' }))]);
    await service.completeTask('fixture', 'fixture-user', 'task', 'Synthetic answer');
    expect(prisma.interviewTask.create).not.toHaveBeenCalled();
  });
  it('records a bounded fallback decision when provider evaluation fails', async () => {
    llm.chat.mockRejectedValue(new Error('synthetic provider unavailable'));
    await service.completeTask('fixture', 'fixture-user', 'task', 'Synthetic explanation with constraints and examples.');
    const data = prisma.answerHistory.create.mock.calls[0][0].data;
    expect(data.score).toBeGreaterThanOrEqual(0); expect(data.score).toBeLessThanOrEqual(1); expect(data.feedback).toBeTruthy();
  });
});
