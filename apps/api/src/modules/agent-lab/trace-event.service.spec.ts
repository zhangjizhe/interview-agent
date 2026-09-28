import { BadRequestException } from '@nestjs/common';
import { TraceEventService } from './trace-event.service';

function createPrismaMock() {
  const prisma: any = {
    run: {
      update: jest.fn().mockResolvedValue({ traceSequence: 3 }),
    },
    traceEvent: {
      create: jest.fn().mockResolvedValue({ id: 'event-3', seq: 3 }),
      findMany: jest.fn(),
    },
  };
  prisma.$transaction = jest.fn(async (callback: (tx: any) => unknown) => callback(prisma));
  return prisma;
}

describe('TraceEventService', () => {
  it('按 seq 重放出稳定且仅模型可见的历史', () => {
    const service = new TraceEventService(createPrismaMock());
    const events = [
      { seq: 3, type: 'tool.result', modelVisible: true, callId: 'call-1', payload: { result: { ok: true } } },
      { seq: 1, type: 'user.message', modelVisible: true, payload: { content: '请开始' } },
      { seq: 2, type: 'tool.call', modelVisible: false, callId: 'call-1', payload: { tool: 'search' } },
      { seq: 4, type: 'turn.end', modelVisible: false, payload: { status: 'COMPLETED' } },
    ];

    const firstReplay = service.projectModelHistory(events);
    const secondReplay = service.projectModelHistory(JSON.parse(JSON.stringify(events)));

    expect(firstReplay).toEqual(secondReplay);
    expect(firstReplay).toEqual([
      { seq: 1, type: 'user.message', role: 'user', content: '请开始', callId: undefined },
      { seq: 3, type: 'tool.result', role: 'tool', content: '{"ok":true}', callId: 'call-1' },
    ]);
  });

  it('拒绝将标准模型可见事件标为不可见', async () => {
    const service = new TraceEventService(createPrismaMock());

    await expect(
      service.append('run-1', {
        type: 'assistant.message',
        modelVisible: false,
        payload: { content: '回答' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('验证每个工具调用都恰有一个终态结果', () => {
    const service = new TraceEventService(createPrismaMock());

    expect(() => service.assertToolCallTerminalPairs([
      { type: 'tool.call', callId: 'call-1' },
      { type: 'tool.result', callId: 'call-1' },
    ])).not.toThrow();
    expect(() => service.assertToolCallTerminalPairs([
      { type: 'tool.call', callId: 'call-1' },
    ])).toThrow(BadRequestException);
  });

  it('追加事件使用递增序号且不会覆盖既有事件', async () => {
    const prisma = createPrismaMock();
    const service = new TraceEventService(prisma);

    await service.append('run-1', {
      type: 'run.failed',
      payload: { error: '超时' },
      error: '超时',
    });

    expect(prisma.run.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { traceSequence: { increment: 1 } },
      }),
    );
    expect(prisma.traceEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          runId: 'run-1',
          seq: 3,
          type: 'run.failed',
        }),
      }),
    );
  });
});
