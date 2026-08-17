jest.mock('../modules/llm/llm.gateway.service', () => ({
  LlmGatewayService: class LlmGatewayService {},
}));

jest.mock('../modules/interview/services/question-bank.service', () => ({
  QuestionBankService: class QuestionBankService {},
}));

import { DynamicTaskQueueService } from '../modules/interview/services/dynamic-task-queue.service';

describe('DynamicTaskQueueService persistence', () => {
  const prisma = {
    interviewTask: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    interviewQuestion: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    interviewAnswer: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    answerHistory: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  const llm = {
    chat: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.interviewTask.findUnique.mockResolvedValue({
      id: 'task-1',
      interviewId: 'interview-1',
      type: 'QUESTION',
      question: '请解释 React Hooks。',
      category: 'frontend',
      difficulty: 'medium',
      context: JSON.stringify({ questionId: 'bank-react-hooks' }),
    });
    prisma.interviewQuestion.findUnique.mockResolvedValue(null);
    prisma.interviewQuestion.create.mockResolvedValue({ id: 'question-1' });
    prisma.interviewAnswer.findUnique.mockResolvedValue(null);
    prisma.interviewAnswer.create.mockResolvedValue({ id: 'answer-1' });
    prisma.answerHistory.create.mockResolvedValue({ id: 'history-1' });
    prisma.interviewTask.update.mockResolvedValue({ id: 'task-1' });
    llm.chat.mockResolvedValue({
      content: JSON.stringify({
        score: 0.7,
        completeness: 0.7,
        correctness: 0.7,
        depth: 0.6,
        feedback: '回答覆盖了基础概念。',
        keyPoints: ['状态'],
        missingPoints: ['真实项目示例'],
        shouldFollowUp: false,
        followUpQuestion: null,
        followUpReason: null,
        shouldAdvance: false,
        advancedQuestion: null,
      }),
    });
    prisma.$transaction.mockImplementation(async (callback: any) => callback(prisma));
  });

  it('persists a new answer with source task and candidate message foreign keys', async () => {
    const service = new DynamicTaskQueueService(prisma as any, llm as any);

    await service.completeTask(
      'interview-1',
      'user-1',
      'task-1',
      'Hooks 让函数组件使用状态和副作用。',
      'message-1',
    );

    expect(prisma.interviewQuestion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        interviewId: 'interview-1',
        sourceTaskId: 'task-1',
        externalQuestionId: 'bank-react-hooks',
        selectionMetadata: {
          mode: 'FULL_SIMULATION',
          targetJobId: null,
          targetJobProfileVersion: null,
          practiceSkillId: null,
          practiceSkillName: null,
          taskType: 'QUESTION',
        },
      }),
    });
    expect(prisma.interviewAnswer.create).toHaveBeenCalledWith({
      data: {
        interviewId: 'interview-1',
        questionId: 'question-1',
        messageId: 'message-1',
        content: 'Hooks 让函数组件使用状态和副作用。',
      },
    });
    expect(prisma.answerHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        interviewId: 'interview-1',
        questionId: 'question-1',
        answerId: 'answer-1',
      }),
    });
  });
});
