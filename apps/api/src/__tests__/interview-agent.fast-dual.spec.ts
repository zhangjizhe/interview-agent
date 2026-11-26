jest.mock('../modules/agent/deepagents-agent.service', () => ({ DeepAgentsAgentService: class {} }));
jest.mock('../modules/agent/multi-agent.service', () => ({ MultiAgentService: class {} }));
jest.mock('../modules/memory/memory.service', () => ({ MemoryService: class {} }));
jest.mock('../modules/interview/services/dynamic-task-queue.service', () => ({ DynamicTaskQueueService: class {} }));
import { InterviewAgentService } from '../modules/agent/interview-agent.service';

describe('InterviewAgentService fast-dual low-latency engine', () => {
  const buildService = (engine: string) => {
    const llm = {
      startSession: jest.fn().mockResolvedValue(undefined),
      streamChat: jest.fn().mockImplementation(async function* () {
        yield { content: '亮点明确，' };
        yield { content: '但请补充断连重试与幂等边界如何验证？' };
        yield { finishReason: 'stop' };
      }),
      chat: jest.fn(),
    };
    const memory = {
      appendMessage: jest.fn().mockResolvedValue(undefined),
      buildContext: jest.fn().mockResolvedValue({
        recalledMemories: [],
        shortTermMessages: [],
        longTermContext: '候选人有高并发 Node.js 与 LangGraph 经验',
      }),
      getWorkingState: jest.fn().mockResolvedValue({ coveredSkills: [] }),
      updateWorkingState: jest.fn().mockResolvedValue(undefined),
      memorize: jest.fn().mockResolvedValue(undefined),
    };
    const langfuse = {
      startTrace: jest.fn().mockReturnValue({ id: 'trace-fast-dual' }),
      logSpan: jest.fn(),
      flush: jest.fn().mockResolvedValue(undefined),
    };
    const bocha = { execute: jest.fn() };
    const contextMgr = {
      compact: jest.fn().mockImplementation((messages) => ({
        tier: 'none',
        messages,
        afterTokens: 100,
        savedTokens: 0,
        stubCount: 0,
        protectedCount: 0,
        summarizeNeeded: false,
      })),
    };
    const deepAgents = { isReady: jest.fn().mockReturnValue(false), stream: jest.fn() };
    const multiAgent = {
      isEnabled: jest.fn().mockReturnValue(true),
      stream: jest.fn().mockImplementation(async function* () {
        yield { type: 'token', content: 'multi-agent-reply' };
      }),
    };
    const config = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'agent.engine') return engine;
        return undefined;
      }),
    };
    const prisma = {
      userToolPreference: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const taskQueue = {
      initializeQueue: jest.fn().mockResolvedValue(undefined),
      getClaimedTask: jest.fn().mockResolvedValue({
        id: 'task-1',
        question: '请解释双模型熔断器的状态机设计。',
      }),
      getNextTask: jest.fn().mockResolvedValue({
        id: 'task-1',
        question: '请解释双模型熔断器的状态机设计。',
      }),
      getQueueStatus: jest.fn().mockResolvedValue({ completedCount: 0 }),
      completeTask: jest.fn().mockResolvedValue(undefined),
    };

    const service = new InterviewAgentService(
      llm as any,
      memory as any,
      langfuse as any,
      bocha as any,
      contextMgr as any,
      deepAgents as any,
      multiAgent as any,
      config as any,
      prisma as any,
      taskQueue as any,
    );

    return { service, llm, multiAgent, langfuse, taskQueue, memory };
  };

  it('uses single-call streaming hot path + post-response evaluator when engine=fast-dual', async () => {
    const { service, llm, multiAgent, langfuse, taskQueue, memory } = buildService('fast-dual');

    const events: any[] = [];
    for await (const event of service.processMessage(
      {
        userId: 'user-1',
        sessionId: 'iv-fast-1',
        position: 'AI Agent Engineer',
        level: 'P6',
        answerMessageId: 'msg-1',
        answerTaskId: 'task-1',
        answerPresentationId: 'pres-1',
        answerClaimToken: 'claim-1',
        approvedAgentPolicy: '严格基于简历细节追问。',
      },
      '我们通过 CLOSED/OPEN/HALF_OPEN 熔断器隔离瞬态故障。',
    )) {
      events.push(event);
    }

    expect(multiAgent.stream).not.toHaveBeenCalled();
    expect(llm.streamChat).toHaveBeenCalledTimes(1);
    const streamCall = llm.streamChat.mock.calls[0][0];
    expect(streamCall.messages[0].role).toBe('system');
    expect(streamCall.messages[0].content).toContain('低延迟深挖策略（fast-dual）');
    expect(streamCall.messages[0].content).toContain('严格基于简历细节追问。');

    const tokens = events.filter((e) => e.type === 'token').map((e) => e.content).join('');
    expect(tokens).toBe('亮点明确，但请补充断连重试与幂等边界如何验证？');
    expect(events.some((e) => e.type === 'meta' && e.engine === 'fast-dual')).toBe(true);
    expect(events.at(-1)).toEqual({ type: 'done' });

    expect(langfuse.logSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'agent.fast_dual.hot_path',
        output: expect.objectContaining({
          responseChars: tokens.length,
        }),
      }),
    );
    expect(taskQueue.completeTask).toHaveBeenCalledTimes(1);
    expect(memory.memorize).toHaveBeenCalledTimes(1);
  });

  it('preserves multi-agent default path when engine=multi', async () => {
    const { service, llm, multiAgent } = buildService('multi');

    const events: any[] = [];
    for await (const event of service.processMessage(
      {
        userId: 'user-1',
        sessionId: 'iv-multi-1',
        position: 'AI Agent Engineer',
        level: 'P6',
      },
      '开始面试',
    )) {
      events.push(event);
    }

    expect(multiAgent.stream).toHaveBeenCalledTimes(1);
    expect(llm.streamChat).not.toHaveBeenCalled();
    expect(events.some((e) => e.type === 'meta' && e.engine === 'multi-agent')).toBe(true);
  });
});
