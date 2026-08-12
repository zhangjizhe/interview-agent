import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../infra/prisma/prisma.service';

/**
 * Returning 404 for foreign resources avoids exposing whether an ID exists.
 */
export async function requireOwnedInterview(
  prisma: PrismaService,
  interviewId: string,
  userId: string,
  options?: { include?: Record<string, unknown> },
) {
  const interview = await prisma.interview.findFirst({
    where: { id: interviewId, userId },
    include: options?.include as any,
  });
  if (!interview) {
    throw new NotFoundException('Interview not found');
  }
  return interview;
}
