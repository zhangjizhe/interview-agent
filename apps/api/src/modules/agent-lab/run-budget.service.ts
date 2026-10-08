import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ToolPolicyError } from './tool-runner.service';

type RunBudget = {
  maxToolCalls?: number;
};

@Injectable()
export class RunBudgetService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * ToolRunner 已追加 tool.call 后调用此方法，因此计数包含当前调用。
   * 没有配置预算时不施加限制。
   */
  async enforceToolCall(runId: string) {
    const run = await this.prisma.run.findUnique({
      where: { id: runId },
      select: { budget: true },
    });
    const budget = (run?.budget || {}) as RunBudget;
    if (typeof budget.maxToolCalls !== 'number') return;
    const calls = await this.prisma.traceEvent.count({
      where: { runId, type: 'tool.call' },
    });
    if (calls > budget.maxToolCalls) {
      throw new ToolPolicyError(
        `Run 工具调用预算已耗尽：${calls}/${budget.maxToolCalls}`,
      );
    }
  }
}
