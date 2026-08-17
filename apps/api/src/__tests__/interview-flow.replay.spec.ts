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
      'data: {"type":"token","content":"已持久化的面试官回复"}\n\n',
      'data: [DONE]\n\n',
    ]);
  });
});
