import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { requireTenant } from '../organizations/tenant-context';

export function requireActor(userId: string) {
  if (requireTenant().userId !== userId) throw new ForbiddenException('需要当前认证身份');
}

export function getOrCreateOwnedWorkspace(prisma: PrismaService, userId: string) {
  return prisma.workspace.upsert({ where: { slug: `personal-${userId}` }, create: {
    name: `${userId} 的工作区`, slug: `personal-${userId}`, ownerId: userId,
    members: { create: { userId, role: 'OWNER' } },
  }, update: {} });
}
