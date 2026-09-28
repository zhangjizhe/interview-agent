import {
  ToolDefinition,
  ToolPolicyError,
  ToolRunner,
} from './tool-runner.service';

function createTraceMock() {
  const events: any[] = [];
  return {
    events,
    append: jest.fn(async (runId: string, event: any) => {
      events.push({ runId, ...event });
      return { id: `event-${events.length}` };
    }),
  };
}

function createApprovalMock() {
  return {
    request: jest.fn().mockResolvedValue({ id: 'approval-1' }),
    resolve: jest.fn().mockResolvedValue({ id: 'approval-1' }),
  };
}

function createBudgetMock() {
  return {
    enforceToolCall: jest.fn().mockResolvedValue(undefined),
  };
}

function createCall() {
  return {
    runId: 'run-1',
    workspaceId: 'workspace-1',
    toolName: 'workspace.write',
    args: { path: 'notes.txt', content: 'hello' },
    callId: 'call-1',
  };
}

describe('ToolRunner', () => {
  it('缺少审批处理器时默认拒绝，且调用和唯一终态结果都被记录', async () => {
    const trace = createTraceMock();
    const approvals = createApprovalMock();
    const tool: ToolDefinition = {
      name: 'workspace.write',
      requiresApproval: true,
      execute: jest.fn(),
    };
    const runner = new ToolRunner(trace as any, approvals as any, createBudgetMock() as any);

    const result = await runner.run(createCall(), tool);

    expect(result).toMatchObject({ callId: 'call-1', status: 'DENIED' });
    expect(tool.execute).not.toHaveBeenCalled();
    expect(approvals.request).toHaveBeenCalledTimes(1);
    expect(approvals.resolve).toHaveBeenCalledWith(
      'run-1',
      'call-1',
      'DENIED',
      expect.any(Object),
    );
    expect(trace.events.filter((event) => event.type === 'tool.call')).toHaveLength(1);
    expect(trace.events.filter((event) => event.type === 'tool.result')).toHaveLength(1);
    expect(trace.events.find((event) => event.type === 'tool.result')).toMatchObject({
      callId: 'call-1',
      payload: { status: 'DENIED' },
    });
  });

  it('hook 建议 allow 也不能绕过工具的强制审批', async () => {
    const trace = createTraceMock();
    const approvals = createApprovalMock();
    const tool: ToolDefinition = {
      name: 'workspace.write',
      requiresApproval: true,
      execute: jest.fn(),
    };
    const runner = new ToolRunner(trace as any, approvals as any, createBudgetMock() as any);

    const result = await runner.run(createCall(), tool, {
      hooks: [{ beforeCall: () => ({ decision: 'ALLOW' }) }],
      approvalHandler: { decide: async () => 'DENIED' },
    });

    expect(result.status).toBe('DENIED');
    expect(approvals.request).toHaveBeenCalledTimes(1);
    expect(tool.execute).not.toHaveBeenCalled();
  });

  it('guard 在执行前阻断调用，且不修改调用参数', async () => {
    const trace = createTraceMock();
    const approvals = createApprovalMock();
    const execute = jest.fn();
    const tool: ToolDefinition = { name: 'workspace.write', execute };
    const runner = new ToolRunner(trace as any, approvals as any, createBudgetMock() as any);
    const call = createCall();

    const result = await runner.run(call, tool, {
      guards: [{
        check: (immutableCall) => {
          expect(Object.isFrozen(immutableCall)).toBe(true);
          expect(immutableCall.args).toEqual(call.args);
          throw new ToolPolicyError('工作区边界拒绝');
        },
      }],
    });

    expect(result).toMatchObject({
      status: 'DENIED',
      error: { type: 'DENIED', message: '工作区边界拒绝' },
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('执行异常归一化为模型可见且可诊断的工具结果', async () => {
    const trace = createTraceMock();
    const approvals = createApprovalMock();
    const tool: ToolDefinition = {
      name: 'workspace.write',
      execute: async () => {
        throw new Error('provider unavailable');
      },
    };
    const runner = new ToolRunner(trace as any, approvals as any, createBudgetMock() as any);

    const result = await runner.run(createCall(), tool);

    expect(result).toEqual({
      callId: 'call-1',
      status: 'ERROR',
      error: { type: 'EXECUTION_ERROR', message: 'provider unavailable' },
    });
    expect(trace.events.find((event) => event.type === 'tool.result')).toMatchObject({
      callId: 'call-1',
      payload: {
        status: 'ERROR',
        error: { type: 'EXECUTION_ERROR', message: 'provider unavailable' },
      },
    });
  });

  it('在记录调用后执行持久化预算检查并拒绝超限执行', async () => {
    const trace = createTraceMock();
    const approvals = createApprovalMock();
    const budget = {
      enforceToolCall: jest.fn().mockRejectedValue(new ToolPolicyError('Run 工具调用预算已耗尽：1/0')),
    };
    const tool: ToolDefinition = { name: 'workspace.write', execute: jest.fn() };
    const runner = new ToolRunner(trace as any, approvals as any, budget as any);

    const result = await runner.run(createCall(), tool);

    expect(result).toMatchObject({ status: 'DENIED' });
    expect(trace.events.map((event) => event.type)).toEqual(['tool.call', 'tool.result']);
    expect(tool.execute).not.toHaveBeenCalled();
  });
});
