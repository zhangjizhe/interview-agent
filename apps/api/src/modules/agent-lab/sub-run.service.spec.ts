import { NotFoundException } from '@nestjs/common';
import { SubRunService } from './sub-run.service';

function createPrismaMock() {
  return {
    workspace: { upsert: jest.fn().mockResolvedValue({ id: 'workspace-1' }) },
    run: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
  };
}

describe('SubRunService', () => {
  it('创建独立子 Run，保存预算并在父子 Trace 写入关系事件', async () => {
    const prisma: any = createPrismaMock();
    prisma.run.findFirst.mockResolvedValue({
      id: 'parent-1',
      workspaceId: 'workspace-1',
      agentId: 'agent-1',
      agentVersionId: 'version-1',
      status: 'RUNNING',
    });
    prisma.run.create.mockResolvedValue({ id: 'child-1', status: 'PENDING' });
    const trace = { append: jest.fn().mockResolvedValue({}) };
    const service = new SubRunService(prisma, trace as any);

    await service.spawn('user-a', 'parent-1', {
      input: { message: '处理子任务' },
      budget: { maxTokens: 300 },
    });

    expect(prisma.run.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          parentRunId: 'parent-1',
          budget: { maxTokens: 300 },
          status: 'PENDING',
        }),
      }),
    );
    expect(trace.append).toHaveBeenCalledWith(
      'parent-1',
      expect.objectContaining({ type: 'subagent.spawned' }),
    );
    expect(trace.append).toHaveBeenCalledWith(
      'child-1',
      expect.objectContaining({ type: 'run.created' }),
    );
  });

  it('拒绝跨 Workspace 读取父 Run', async () => {
    const prisma: any = createPrismaMock();
    prisma.run.findFirst.mockResolvedValue(null);
    const service = new SubRunService(prisma, { append: jest.fn() } as any);

    await expect(
      service.spawn('user-a', 'foreign-parent', { input: { message: '开始' } }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.run.create).not.toHaveBeenCalled();
  });

  it('取消子 Run 后向父 Run 投递可审计结果事件', async () => {
    const prisma: any = createPrismaMock();
    prisma.run.findFirst.mockResolvedValue({
      id: 'child-1',
      parentRunId: 'parent-1',
      workspaceId: 'workspace-1',
      status: 'PENDING',
    });
    prisma.run.update.mockResolvedValue({ id: 'child-1', status: 'CANCELLED' });
    const trace = { append: jest.fn().mockResolvedValue({}) };
    const service = new SubRunService(prisma, trace as any);

    await service.cancel('user-a', 'parent-1', 'child-1');

    expect(prisma.run.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'CANCELLED' }) }),
    );
    expect(trace.append).toHaveBeenCalledWith(
      'parent-1',
      expect.objectContaining({
        type: 'subagent.result',
        payload: { childRunId: 'child-1', status: 'CANCELLED' },
      }),
    );
  });

  it('后台子 Run 失败时保留失败证据并通知父 Run', async () => {
    const prisma: any = createPrismaMock();
    prisma.run.findFirst.mockResolvedValue({
      id: 'child-1',
      parentRunId: 'parent-1',
      workspaceId: 'workspace-1',
      status: 'RUNNING',
    });
    prisma.run.update.mockResolvedValue({ id: 'child-1', status: 'FAILED' });
    const trace = { append: jest.fn().mockResolvedValue({}) };
    const service = new SubRunService(prisma, trace as any);

    await service.fail('user-a', 'parent-1', 'child-1', 'worker lost');

    expect(trace.append).toHaveBeenCalledWith(
      'child-1',
      expect.objectContaining({ type: 'run.failed', error: 'worker lost' }),
    );
    expect(trace.append).toHaveBeenCalledWith(
      'parent-1',
      expect.objectContaining({
        type: 'subagent.result',
        payload: { childRunId: 'child-1', status: 'FAILED', error: 'worker lost' },
      }),
    );
  });
});
