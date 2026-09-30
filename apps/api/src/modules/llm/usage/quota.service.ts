import { MetricsService } from '../../metrics/metrics.service';
import { BadRequestException, HttpException, Injectable, Logger, Optional, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Plan, Prisma, UsageLedgerType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { requireTenant } from '../../organizations/tenant-context';
import type { ChatParams } from '../providers/types';

export class QuotaExceededException extends HttpException {
  constructor() { super({ code: 'QUOTA_EXCEEDED', message: '本月额度已用完，请联系管理员或下月重试。' }, 429); }
}

@Injectable()
export class QuotaService {
  private readonly logger = new Logger(QuotaService.name);
  constructor(private prisma: PrismaService, private config: ConfigService, @Optional() private metrics?: MetricsService) {}

  private periodStart() {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }

  /** 组织行锁串行化检查与记账；事务内不调用外部服务。失败调用也占用已提交的次数。 */
  private async consume<T>(type: UsageLedgerType, create: (tx: Prisma.TransactionClient, plan: Plan) => Promise<{ result: T; interviewId?: string }>): Promise<T> {
    const scope = requireTenant();
    const { organizationId, userId } = scope;
    if (scope.quotaFailure) throw new HttpException(scope.quotaFailure, scope.quotaFailure.status);
    if (!userId) throw new ServiceUnavailableException('Quota identity required');
    const periodStart = this.periodStart();
    const receiptId = randomUUID();
    try {
      const accepted = await this.prisma.$transaction(async tx => {
        const organization = await tx.organization.update({ where: { id: organizationId }, data: { quotaRevision: { increment: 1 } }, include: { plan: true } });
        const plan = organization.plan;
        const limit = type === 'LLM_CALL' ? plan.monthlyLlmCalls : plan.monthlyInterviews;
        const used = (await tx.usageLedger.aggregate({ where: { organizationId, periodStart, type }, _sum: { units: true } }))._sum.units || 0;
        if (used >= limit) throw new QuotaExceededException();
        if (type === 'INTERVIEW_START') {
          const raw = this.config.get<string>('quota.monthlyInterviewLimit') || process.env.QUOTA_MONTHLY_INTERVIEW_LIMIT;
          const userLimit = raw ? Number(raw) : null;
          if (userLimit !== null && Number.isInteger(userLimit) && userLimit > 0) {
            const userUsed = (await tx.usageLedger.aggregate({ where: { userId, periodStart, type }, _sum: { units: true } }))._sum.units || 0;
            if (userUsed >= userLimit) throw new QuotaExceededException();
          }
        }
        const { result, interviewId } = await create(tx, plan);
        await tx.usageLedger.create({ data: { id: receiptId, userId, organizationId, interviewId, type, periodStart, units: 1 } });
        return { result, warning: used < limit * 0.9 && used + 1 >= limit * 0.9 };
      }, { maxWait: 5000, timeout: 10000 });
      if (accepted.warning) this.logger.warn({ event: 'quota_warning', organizationId, type, periodStart: periodStart.toISOString(), threshold: 0.9 });
      return accepted.result;
    } catch (error) {
      const response = error instanceof HttpException ? error.getResponse() : null;
      const code = response && typeof response === 'object' && 'code' in response ? String(response.code) : 'QUOTA_UNAVAILABLE';
      const status = error instanceof HttpException ? error.getStatus() : 503;
      const message = error instanceof HttpException ? error.message : '额度服务暂不可用，请稍后重试。';
      if (code === 'QUOTA_EXCEEDED') this.metrics?.reject('quota');
      scope.quotaFailure = { code, status, message };
      throw new HttpException({ code, message }, status);
    }
  }

  async reserveLlm(params: ChatParams): Promise<ChatParams> {
    return this.consume('LLM_CALL', async (_tx, plan) => {
      const size = Buffer.byteLength(JSON.stringify({ messages: params.messages, tools: params.tools }), 'utf8');
      if (size > plan.maxInputBytes) throw new BadRequestException({ code: 'AI_INPUT_TOO_LARGE', message: '输入超过套餐单次大小限制。' });
      const requested = params.maxTokens ?? plan.maxOutputTokens;
      if (!Number.isInteger(requested) || requested < 1) throw new BadRequestException('maxTokens must be a positive integer');
      return { result: { ...params, maxTokens: Math.min(requested, plan.maxOutputTokens) } };
    });
  }

  async createInterview(data: Prisma.InterviewUncheckedCreateInput) {
    const { userId } = requireTenant();
    if (data.userId !== userId) throw new BadRequestException('Invalid interview owner');
    return this.consume('INTERVIEW_START', async tx => {
      const interview = await tx.interview.create({ data });
      return { result: interview, interviewId: interview.id };
    });
  }
}
