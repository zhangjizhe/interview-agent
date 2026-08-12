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
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('stores a salted password hash and assigns an explicitly configured bootstrap admin', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(async ({ data }: any) => ({
      ...data,
      role: data.role ?? 'USER',
    }));
    const service = new AuthService(jwtService as any, config as any, prisma as any);

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
    const service = new AuthService(jwtService as any, config as any, prisma as any);
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
    const service = new AuthService(jwtService as any, config as any, prisma as any);

    await expect(service.login({ userId: 'normal-user', password: 'wrong-password-123' }))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });
});
