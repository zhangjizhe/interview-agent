import { ToolPolicyError } from './tool-runner.service';
import { RunBudgetService } from './run-budget.service';

describe('RunBudgetService', () => {
  it('仅在设置 maxToolCalls 时拒绝超出工具调用预算', async () => {
    const prisma: any = {
      run: { findUnique: jest.fn().mockResolvedValue({ budget: { maxToolCalls: 1 } }) },
      traceEvent: { count: jest.fn().mockResolvedValue(2) },
    };
    const service = new RunBudgetService(prisma);

    await expect(service.enforceToolCall('run-1')).rejects.toBeInstanceOf(ToolPolicyError);
  });
});
