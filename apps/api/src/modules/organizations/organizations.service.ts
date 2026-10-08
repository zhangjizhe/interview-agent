import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { tenantContext } from './tenant-context';

@Injectable()
export class OrganizationsService {
  constructor(private prisma: PrismaService, private config: ConfigService) {}

  private assertPlatformAdmin(actor: { userId: string; role: string }) {
    if (actor.role !== 'ADMIN' || !(this.config.get<string[]>('auth.adminUserIds') || []).includes(actor.userId)) {
      throw new ForbiddenException('Platform administrator required');
    }
  }

  async create(actor: { userId: string; role: string }, name: string) {
    this.assertPlatformAdmin(actor);
    return this.prisma.organization.create({ data: { name } });
  }

  async configurePlan(actor: { userId: string; role: string }, id: string, limits: { monthlyInterviews: number; monthlyLlmCalls: number; maxInputBytes: number; maxOutputTokens: number }) {
    this.assertPlatformAdmin(actor);
    return this.prisma.plan.update({ where: { id }, data: limits });
  }

  async assignPlan(actor: { userId: string; role: string }, organizationId: string, planId: string) {
    this.assertPlatformAdmin(actor);
    return this.prisma.organization.update({ where: { id: organizationId }, data: { planId }, select: { id: true, planId: true } });
  }

  async assign(actor: { userId: string; role: string }, organizationId: string, userId: string) {
    this.assertPlatformAdmin(actor);
    // 唯一跨组织管理入口。复合外键拒绝带历史资源的成员直接转移，避免私有数据随身份移动。
    return tenantContext.exit(async () => {
      const organization = await this.prisma.organization.findUnique({ where: { id: organizationId } });
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!organization || !user) throw new NotFoundException('Resource not found');
      try {
        return await this.prisma.user.update({ where: { id: userId }, data: { organizationId }, select: { id: true, organizationId: true } });
      } catch (error: any) {
        if (error?.code === 'P2003' || error instanceof NotFoundException) throw new ConflictException('用户已有组织资源，必须先完成独立数据迁移');
        throw error;
      }
    });
  }
}
