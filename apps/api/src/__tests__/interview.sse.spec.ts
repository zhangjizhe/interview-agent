// Real NestJS HTTP/SSE boundary with synthetic agent and database fixtures.
jest.mock('../modules/agent/interview-agent.service', () => ({ InterviewAgentService: class {} }));
jest.mock('../modules/interview/services/question-generator.service', () => ({ QuestionGeneratorService: class {} }));
jest.mock('../modules/interview/services/resume-parser.service', () => ({ ResumeParserService: class {} }));
jest.mock('../modules/interview/services/scoring.service', () => ({ ScoringService: class {} }));
jest.mock('../modules/agent-lab/interview-lab-bridge.service', () => ({ InterviewLabBridgeService: class {} }));
import { Test } from '@nestjs/testing';
import { InterviewFlowController } from '../modules/interview/controllers/interview-flow.controller';
import { InterviewAgentService } from '../modules/agent/interview-agent.service';
import { QuestionGeneratorService } from '../modules/interview/services/question-generator.service';
import { ResumeParserService } from '../modules/interview/services/resume-parser.service';
import { ScoringService } from '../modules/interview/services/scoring.service';
import { InterviewLabBridgeService } from '../modules/agent-lab/interview-lab-bridge.service';
import { StreamMessageDeliveryService } from '../modules/interview/services/stream-message-delivery.service';
import { PrismaService } from '../infra/prisma/prisma.service';

describe('Interview SSE current delivery contract', () => {
  let app: any, base: string;
  const agent = { processMessage: jest.fn() };
  const prisma = { interview: { findFirst: jest.fn() } };
  const delivery = { claimCandidateMessage: jest.fn(), persistAssistantResponse: jest.fn(), releaseUnansweredMessage: jest.fn().mockResolvedValue(undefined) };
  const lab = { startTurn: jest.fn().mockRejectedValue(new Error('fixture disabled')) };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [InterviewFlowController], providers: [
      { provide: InterviewAgentService, useValue: agent }, { provide: PrismaService, useValue: prisma },
      { provide: QuestionGeneratorService, useValue: {} }, { provide: ResumeParserService, useValue: {} }, { provide: ScoringService, useValue: {} },
      { provide: StreamMessageDeliveryService, useValue: delivery }, { provide: InterviewLabBridgeService, useValue: lab },
    ] }).compile();
    app = module.createNestApplication(); app.use((req: any, _res: any, next: any) => { req.user = { userId: 'fixture-user' }; next(); });
    await app.listen(0, '127.0.0.1'); base = await app.getUrl();
  });
  beforeEach(() => {
    jest.clearAllMocks(); prisma.interview.findFirst.mockResolvedValue({ id: 'fixture', userId: 'fixture-user', status: 'ACTIVE', position: 'Engineer', level: 'P5' });
    delivery.claimCandidateMessage.mockResolvedValue({ state: 'new', message: { id: 'fixture-message' } });
    agent.processMessage.mockImplementation(async function* () { yield { type: 'thinking', content: 'private detail' }; yield { type: 'token', content: 'hello\nworld' }; });
  });
  afterAll(async () => { await app?.close(); });
  async function post(content = 'synthetic input') {
    const response = await fetch(`${base}/interview/fixture/message`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content, clientMessageId: 'fixture-request-1' }), signal: AbortSignal.timeout(3000) });
    return { response, text: await response.text() };
  }
  it('flushes candidate tokens and DONE, drops internal events and persists exactly one response', async () => {
    const { response, text } = await post();
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const tokens = text.split('\n\n').filter(line => line.startsWith('data: {')).map(line => JSON.parse(line.slice(6)));
    expect(tokens.map(event => event.type)).toEqual(['heartbeat', 'token']);
    expect(tokens[1].content).toBe('hello\nworld'); expect(text).toContain('data: [DONE]\n\n');
    expect(text).not.toContain('private detail'); expect(delivery.persistAssistantResponse).toHaveBeenCalledTimes(1);
  });
  it('rejects empty input before claiming or invoking a model', async () => {
    expect((await post('')).text).toContain('"type":"error"');
    expect(delivery.claimCandidateMessage).not.toHaveBeenCalled(); expect(agent.processMessage).not.toHaveBeenCalled();
  });
  it('replays a persisted answer without new agent work', async () => {
    delivery.claimCandidateMessage.mockResolvedValue({ state: 'replay', content: 'saved fixture' });
    expect((await post()).text).toContain('saved fixture'); expect(agent.processMessage).not.toHaveBeenCalled();
  });
  it('does not expose provider errors or persist partial failed responses', async () => {
    agent.processMessage.mockImplementation(async function* () { yield { type: 'error', error: 'provider-secret-detail' }; });
    const { text } = await post(); expect(text).toContain('"type":"error"'); expect(text).not.toContain('provider-secret-detail');
    expect(delivery.persistAssistantResponse).not.toHaveBeenCalled(); expect(delivery.releaseUnansweredMessage).toHaveBeenCalledWith('fixture-message');
  });
});
