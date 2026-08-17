jest.mock('../../infra/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('./application.service', () => ({
  ApplicationService: class ApplicationService {},
}));

jest.mock('./agent-runtime.service', () => ({
  AgentRuntimeService: class AgentRuntimeService {},
}));

import { InterviewLabBridgeService } from './interview-lab-bridge.service';

describe('InterviewLabBridgeService', () => {
  it('为 Interview 回合创建带 externalSessionId 的 Lab Run 关联', async () => {
    const applications = {
      bootstrapInterviewApplication: jest.fn().mockResolvedValue({
        id: 'application-1',
        agentId: 'agent-1',
      }),
    };
    const runtime = {
      startExternalRun: jest.fn().mockResolvedValue({ id: 'run-1' }),
      completeExternalRun: jest.fn(),
      failExternalRun: jest.fn(),
    };
    const prisma: any = { applicationRun: { create: jest.fn().mockResolvedValue({ id: 'link-1' }) } };
    const service = new InterviewLabBridgeService(applications as any, runtime as any, prisma);

    await service.startTurn(
      'user-a',
      { id: 'interview-1', position: '后端工程师', level: 'P6' },
      '请开始第一题',
    );

    expect(runtime.startExternalRun).toHaveBeenCalledWith(
      'user-a',
      'agent-1',
      expect.objectContaining({
        application: 'interview',
        externalRunId: 'interview-1',
        input: expect.objectContaining({ message: '请开始第一题', position: '后端工程师' }),
      }),
    );
    expect(prisma.applicationRun.create).toHaveBeenCalledWith({
      data: {
        applicationId: 'application-1',
        runId: 'run-1',
        externalSessionId: 'interview-1',
      },
    });
  });
});
