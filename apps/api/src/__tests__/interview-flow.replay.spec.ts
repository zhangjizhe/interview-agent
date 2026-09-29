jest.mock('../modules/agent-lab/interview-lab-bridge.service', () => ({
  InterviewLabBridgeService: class InterviewLabBridgeService {},
}));
jest.mock('../modules/agent/interview-agent.service', () => ({
  InterviewAgentService: class InterviewAgentService {},
}));
jest.mock('../modules/interview/services/question-generator.service', () => ({
  QuestionGeneratorService: class QuestionGeneratorService {},
}));
jest.mock('../modules/interview/services/resume-parser.service', () => ({
  ResumeParserService: class ResumeParserService {},
}));
jest.mock('../modules/interview/services/scoring.service', () => ({
  ScoringService: class ScoringService {},
}));

import { tenantContext, requireTenant } from '../modules/organizations/tenant-context';
import { InterviewFlowController } from '../modules/interview/controllers/interview-flow.controller';

describe('InterviewFlowController stream replay', () => {
  it('replays a completed request without calling the Agent again', async () => {
    const agent = { processMessage: jest.fn() };
    const prisma = {
      interview: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'interview-1',
          userId: 'user-1',
          position: 'AI Agent Engineer',
          level: 'P5',
          status: 'IN_PROGRESS',
          mode: 'FULL_SIMULATION',
          targetJobId: 'job-1',
          targetJobProfileVersion: 2,
          practiceSkill: null,
        }),
      },
    };
    const delivery = {
      claimCandidateMessage: jest.fn().mockResolvedValue({
        state: 'replay',
        content: '已持久化的面试官回复',
      }),
    };
    const writes: string[] = [];
    const response = {
      once: jest.fn(),
      status: jest.fn(),
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn((chunk: string) => {
        writes.push(chunk);
        return true;
      }),
      flush: jest.fn(),
      end: jest.fn((callback?: () => void) => callback?.()),
    };
    const controller = new InterviewFlowController(
      agent as any,
      {} as any,
      {} as any,
      {} as any,
      prisma as any,
      delivery as any,
      { startTurn: jest.fn() } as any,
    );

    await controller.streamMessage(
      'interview-1',
      { userId: 'ignored', content: '我的回答', clientMessageId: 'request-1234' },
      { user: { userId: 'user-1' } },
      response as any,
    );

    expect(delivery.claimCandidateMessage).toHaveBeenCalledWith(
      'interview-1',
      '我的回答',
      'request-1234',
    );
    expect(agent.processMessage).not.toHaveBeenCalled();
    expect(writes).toEqual([
      'data: {"type":"heartbeat"}\n\n',
      'data: {"type":"token","content":"已持久化的面试官回复"}\n\n',
      'data: [DONE]\n\n',
    ]);
  });
  it('跨组织或无权限资源在发送 SSE 头之前返回 404', async () => {
    const response = { flushHeaders: jest.fn() };
    const controller = new InterviewFlowController({} as any, {} as any, {} as any, {} as any,
      { interview: { findFirst: async () => null } } as any, {} as any, {} as any);
    await expect(controller.streamMessage('foreign', { userId: 'ignored', content: 'test' }, { user: { userId: 'u' } }, response as any)).rejects.toMatchObject({ status: 404 });
    expect(response.flushHeaders).not.toHaveBeenCalled();
  });
  it('流式额度拒绝返回稳定错误码，不保存兜底回答', async () => {
    const writes: string[] = [];
    const response = { status: jest.fn(), setHeader: jest.fn(), flushHeaders: jest.fn(), once: jest.fn(),
      write: (s: string) => { writes.push(s); return true; }, end: (cb: () => void) => cb?.() };
    const delivery = { claimCandidateMessage: async () => ({ state: 'new', message: { id: 'm' } }),
      persistAssistantResponse: jest.fn(), releaseUnansweredMessage: jest.fn().mockResolvedValue(undefined) };
    const agent = { async *processMessage() {
      requireTenant().quotaFailure = { status: 429, code: 'QUOTA_EXCEEDED', message: '额度已用完' };
      yield { type: 'token', content: 'fallback' };
    } };
    const controller = new InterviewFlowController(agent as any, {} as any, {} as any, {} as any,
      { interview: { findFirst: async () => ({ id: 'i', userId: 'u', status: 'IN_PROGRESS' }) } } as any,
      delivery as any, { startTurn: async () => { throw new Error('disabled'); } } as any);
    await tenantContext.run({ organizationId: 'o', userId: 'u' }, () => controller.streamMessage('i', { userId: 'u', content: 'test' }, { user: { userId: 'u' } }, response as any));
    expect(writes.join('')).toContain('"code":"QUOTA_EXCEEDED"');
    expect(writes.join('')).not.toContain('[DONE]');
    expect(writes.join('')).not.toContain('fallback');
    expect(delivery.persistAssistantResponse).not.toHaveBeenCalled();
    expect(delivery.releaseUnansweredMessage).toHaveBeenCalledWith('m');
  });

});
