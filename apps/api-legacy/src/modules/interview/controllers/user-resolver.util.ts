import { PrismaService } from '../../../infra/prisma/prisma.service';

/**
 * 解析 demo userId 字符串 → Prisma user.id（cm... cuid）。
 *
 * 业务背景：
 * - demo 模式下 userId 是 'demo-user-xxx' 这种字符串，前端用 email `${userId}@demo.local` 查 Prisma user
 * - 真实 cuid（cm开头）直接透传，email 形式查 Prisma
 *
 * 复用：LifecycleController.getMemories + ResumeController.getUserResumes 都用，
 * 拆 controller 后提 util 避免重复实现 + prisma 注入重复。
 *
 * 注意：调用方需在自己的 controller 注入 PrismaService 后调用。
 */
export async function resolveUserId(
  prisma: PrismaService,
  userId: string,
): Promise<string | null> {
  if (!userId) return null;
  if (userId.includes('@') || userId.startsWith('cm')) return userId;
  const user = await prisma.user.findUnique({
    where: { email: `${userId}@demo.local` },
  });
  return user?.id || null;
}