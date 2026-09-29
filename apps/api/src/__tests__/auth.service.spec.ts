import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../modules/auth/auth.service';

describe('AuthService credentials', () => {
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'auth.jwtExpiresIn') return '7d';
      if (key === 'auth.adminUserIds') return ['admin-user'];
      return undefined;
    }),
  };
  const jwtService = {
    signAsync: jest.fn().mockResolvedValue('signed-jwt'),
  };
  const prisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };

  const sessions = { changePassword: jest.fn(async (_userId: string, update: () => Promise<any>) => update()), version: jest.fn().mockResolvedValue('0'), issue: jest.fn(async (user: any) => { await jwtService.signAsync({ sub: user.id, role: user.role }, {}); return { accessToken: 'signed-jwt' }; }) };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('stores a salted password hash and assigns an explicitly configured bootstrap admin', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(async ({ data }: any) => ({
      ...data,
      role: data.role ?? 'USER',
    }));
    const service = new AuthService(jwtService as any, config as any, prisma as any, sessions as any);

    const result = await service.register('admin-user', 'long-enough-password');

    expect(result.role).toBe('ADMIN');
    expect(prisma.user.create.mock.calls[0][0].data.passwordHash).toMatch(/^[a-f0-9]{32}:[a-f0-9]{128}$/);
  });

  it('issues a JWT only after verifying the stored password hash', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(async ({ data }: any) => ({
      ...data,
      role: data.role ?? 'USER',
    }));
    const service = new AuthService(jwtService as any, config as any, prisma as any, sessions as any);
    await service.register('normal-user', 'long-enough-password');
    const created = prisma.user.create.mock.calls[0][0].data;
    prisma.user.findUnique.mockResolvedValue({ ...created, role: 'USER' });

    const result = await service.login({ userId: 'normal-user', password: 'long-enough-password' });

    expect(result.accessToken).toBe('signed-jwt');
    expect(jwtService.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'normal-user', role: 'USER' }),
      expect.any(Object),
    );
  });

  it('rejects an incorrect password without issuing a JWT', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'normal-user',
      email: 'normal-user@local',
      passwordHash: 'invalid:hash',
      role: 'USER',
    });
    const service = new AuthService(jwtService as any, config as any, prisma as any, sessions as any);

    await expect(service.login({ userId: 'normal-user', password: 'wrong-password-123' }))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });
  it('改密码校验旧密码并通过会话锁执行条件更新', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const service = new AuthService(jwtService as any, config as any, prisma as any, sessions as any);
    await service.register('normal-user', 'long-enough-password');
    const created = prisma.user.create.mock.calls[0][0].data;
    prisma.user.findUnique.mockResolvedValue(created);
    await service.changePassword('normal-user', 'long-enough-password', 'new-long-password');
    expect(sessions.changePassword).toHaveBeenCalledWith('normal-user', expect.any(Function));
    expect(prisma.user.updateMany).toHaveBeenCalledWith({ where: { id: 'normal-user', passwordHash: created.passwordHash }, data: { passwordHash: expect.any(String) } });
    expect(prisma.user.updateMany.mock.calls[0][0].data.passwordHash).not.toBe(created.passwordHash);
  });
  it('错误旧密码不会更新或吊销会话', async () => {
    prisma.user.findUnique.mockResolvedValue({ passwordHash: 'invalid:hash' });
    const service = new AuthService(jwtService as any, config as any, prisma as any, sessions as any);
    await expect(service.changePassword('normal-user', 'wrong-password-123', 'new-long-password')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(sessions.changePassword).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

});
