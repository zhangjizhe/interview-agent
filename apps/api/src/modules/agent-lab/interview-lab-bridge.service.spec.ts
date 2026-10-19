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
        agent: {
          currentVersion: {
            id: 'version-1',
            version: '1.0.0',
            status: 'PUBLISHED',
            systemPrompt: '只问与目标岗位相关的问题。',
          },
        },
      }),
    };
    const runtime = {
      startExternalRun: jest.fn().mockResolvedValue({ id: 'run-1', agentVersionId: 'version-1' }),
      completeExternalRun: jest.fn(),
      failExternalRun: jest.fn(),
    };
    const prisma: any = { applicationRun: { create: jest.fn().mockResolvedValue({ id: 'link-1' }) } };
    const service = new InterviewLabBridgeService(applications as any, runtime as any, prisma);

    const result = await service.startTurn(
      'user-a',
      { id: 'interview-1', position: '后端工程师', level: 'P6' },
      '请开始第一题',
    );

    expect(runtime.startExternalRun).toHaveBeenCalledWith(
      'user-a',
      'agent-1',
      expect.objectContaining({
        agentVersionId: 'version-1',
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
    expect(result).toMatchObject({
      id: 'run-1',
      approvedPolicy: '只问与目标岗位相关的问题。',
      agentVersion: { id: 'version-1', version: '1.0.0' },
    });
  });

  function fixture(currentVersion: any = { id: 'version-1', version: '1.0.0', status: 'PUBLISHED', systemPrompt: 'Approved policy' }) {
    const application = { id: 'application-1', agentId: 'agent-1', agent: { currentVersion } };
    const applications = { bootstrapInterviewApplication: jest.fn().mockResolvedValue(application) };
    const runtime = { startExternalRun: jest.fn().mockResolvedValue({ id: 'run-1', agentVersionId: 'version-1' }), failExternalRun: jest.fn().mockResolvedValue({ status: 'FAILED' }) };
    const prisma = { applicationRun: { create: jest.fn().mockResolvedValue({ id: 'link-1' }) } };
    return { application, applications, runtime, prisma, service: new InterviewLabBridgeService(applications as any, runtime as any, prisma as any) };
  }
  const interview = { id: 'interview-1', position: 'Backend', level: 'P6' };

  it('pins policy and Run to the original published snapshot during concurrent publication', async () => {
    const f = fixture();
    f.runtime.startExternalRun.mockImplementation(async (_user: any, _agent: any, dto: any) => {
      // Publication changes after bootstrap and before the runtime resolves.
      Object.assign(f.application.agent.currentVersion, { id: 'version-2', version: '2.0.0', systemPrompt: 'New policy' });
      return { id: 'run-1', agentVersionId: dto.agentVersionId };
    });
    const result = await f.service.startTurn('user-a', interview, 'Start');
    expect(f.runtime.startExternalRun).toHaveBeenCalledWith('user-a', 'agent-1', expect.objectContaining({ agentVersionId: 'version-1' }));
    expect(result).toMatchObject({ agentVersionId: 'version-1', approvedPolicy: 'Approved policy', agentVersion: { id: 'version-1', version: '1.0.0' } });
    expect(f.runtime.failExternalRun).not.toHaveBeenCalled();
  });

  it.each([null, { id: 'draft-1', status: 'DRAFT', systemPrompt: 'Unapproved' }])('rejects an absent or draft snapshot before creating a Run (%j)', async version => {
    const f = fixture(version);
    await expect(f.service.startTurn('user-a', interview, 'Start')).rejects.toThrow('已发布');
    expect(f.runtime.startExternalRun).not.toHaveBeenCalled();
    expect(f.prisma.applicationRun.create).not.toHaveBeenCalled();
  });

  it('fails a mismatched Run and does not associate it with the application', async () => {
    const f = fixture();
    f.runtime.startExternalRun.mockResolvedValue({ id: 'run-1', agentVersionId: 'version-2' });
    await expect(f.service.startTurn('user-a', interview, 'Start')).rejects.toThrow('快照不一致');
    expect(f.runtime.failExternalRun).toHaveBeenCalledWith('run-1', 'Interview Lab Run 版本与已发布策略快照不一致');
    expect(f.prisma.applicationRun.create).not.toHaveBeenCalled();
  });

  it('fails the created Run when persisting the application association fails', async () => {
    const f = fixture();
    f.prisma.applicationRun.create.mockRejectedValue(new Error('Synthetic association unavailable'));
    await expect(f.service.startTurn('user-a', interview, 'Start')).rejects.toThrow('Synthetic association unavailable');
    expect(f.runtime.failExternalRun).toHaveBeenCalledWith('run-1', 'Synthetic association unavailable');
  });
});
