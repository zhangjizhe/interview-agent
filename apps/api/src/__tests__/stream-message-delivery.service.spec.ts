import { StreamMessageDeliveryService } from '../modules/interview/services/stream-message-delivery.service';

describe('StreamMessageDeliveryService', () => {
  const prisma = {
    message: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a new candidate message for a new client request ID', async () => {
    prisma.message.findUnique.mockResolvedValue(null);
    prisma.message.create.mockResolvedValue({ id: 'message-1' });
    const service = new StreamMessageDeliveryService(prisma as any);

    await expect(service.claimCandidateMessage('interview-1', '我的回答', 'request-1234'))
      .resolves.toEqual({ state: 'new', message: { id: 'message-1' } });
    expect(prisma.message.create).toHaveBeenCalledWith({
      data: {
        interviewId: 'interview-1',
        role: 'user',
        content: '我的回答',
        clientMessageId: 'request-1234',
      },
      select: { id: true },
    });
  });

  it('replays the persisted assistant response without creating another user message', async () => {
    prisma.message.findUnique.mockResolvedValue({
      id: 'message-1',
      interviewId: 'interview-1',
      role: 'user',
      content: '我的回答',
    });
    prisma.message.findFirst.mockResolvedValue({ content: '已保存的面试官回复' });
    const service = new StreamMessageDeliveryService(prisma as any);

    await expect(service.claimCandidateMessage('interview-1', '我的回答', 'request-1234'))
      .resolves.toEqual({ state: 'replay', content: '已保存的面试官回复' });
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('does not disclose or reuse a request ID from another interview', async () => {
    prisma.message.findUnique.mockResolvedValue({
      id: 'message-1',
      interviewId: 'interview-other',
      role: 'user',
      content: '我的回答',
    });
    const service = new StreamMessageDeliveryService(prisma as any);

    await expect(service.claimCandidateMessage('interview-1', '我的回答', 'request-1234'))
      .resolves.toEqual({ state: 'conflict' });
    expect(prisma.message.findFirst).not.toHaveBeenCalled();
  });

  it('reports a duplicate request as pending while its first response is still running', async () => {
    prisma.message.findUnique.mockResolvedValue({
      id: 'message-1',
      interviewId: 'interview-1',
      role: 'user',
      content: '我的回答',
    });
    prisma.message.findFirst.mockResolvedValue(null);
    const service = new StreamMessageDeliveryService(prisma as any);

    await expect(service.claimCandidateMessage('interview-1', '我的回答', 'request-1234'))
      .resolves.toEqual({ state: 'pending' });
  });
});
