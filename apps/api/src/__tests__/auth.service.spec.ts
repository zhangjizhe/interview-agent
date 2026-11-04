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
      findFirst: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };

  const sessions = { changePassword: jest.fn(async (_userId: string, update: () => Promise<any>) => update()), version: jest.fn().mockResolvedValue('0'), issue: jest.fn(async (user: any) => { await jwtService.signAsync({ sub: user.id, role: user.role }, {}); return { accessToken: 'signed-jwt' }; }) };
  const emailVerification = {
    normalizeEmail: jest.fn((email: string) => email.trim().toLowerCase()),
    issue: jest.fn().mockResolvedValue({ challengeId: '11111111-1111-4111-8111-111111111111' }),
    consume: jest.fn().mockResolvedValue({ userId: 'normal-user', subject: 'email-subject' }),
    emailSubject: jest.fn().mockReturnValue('email-subject'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findFirst.mockResolvedValue(null);
    emailVerification.issue.mockReset().mockResolvedValue({ challengeId: '11111111-1111-4111-8111-111111111111' });
    emailVerification.consume.mockResolvedValue({ userId: 'normal-user', subject: 'email-subject' });
    emailVerification.emailSubject.mockReturnValue('email-subject');
  });

  it('stores a salted password hash and assigns an explicitly configured bootstrap admin', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(async ({ data }: any) => ({
      ...data,
      role: data.role ?? 'USER',
    }));
    const service = new AuthService(jwtService as any, config as any, prisma as any, sessions as any, emailVerification as any);

    const result = await service.register('admin-user', 'long-enough-password', 'admin@example.com', '11111111-1111-4111-8111-111111111111', '123456');

    expect(result.role).toBe('ADMIN');
    expect(prisma.user.create.mock.calls[0][0].data.email).toBe('admin@example.com');
    expect(prisma.user.create.mock.calls[0][0].data.emailVerifiedAt).toBeInstanceOf(Date);
    expect(prisma.user.create.mock.calls[0][0].data.passwordHash).toMatch(/^[a-f0-9]{32}:[a-f0-9]{128}$/);
  });

  it('issues a JWT only after verifying the stored password hash', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(async ({ data }: any) => ({
      ...data,
      role: data.role ?? 'USER',
    }));
    const service = new AuthService(jwtService as any, config as any, prisma as any, sessions as any, emailVerification as any);
    await service.register('normal-user', 'long-enough-password', 'normal@example.com', '11111111-1111-4111-8111-111111111111', '123456');
    const created = prisma.user.create.mock.calls[0][0].data;
    prisma.user.findUnique.mockResolvedValue({ ...created, role: 'USER', emailVerifiedAt: new Date() });

    emailVerification.issue.mockRejectedValueOnce(new Error('SMTP unavailable'));
    const result = await service.login({ userId: 'normal-user', password: 'long-enough-password' });
    expect(emailVerification.issue).not.toHaveBeenCalled();
    expect(emailVerification.consume).toHaveBeenCalledTimes(1); // registration proof only
    expect(result).not.toHaveProperty('challengeId');

    expect((result as any).accessToken).toBe('signed-jwt');
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
    const service = new AuthService(jwtService as any, config as any, prisma as any, sessions as any, emailVerification as any);

    await expect(service.login({ userId: 'normal-user', password: 'wrong-password-123' }))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });
  it('未通过注册邮箱验证码时不会创建账号', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    emailVerification.consume.mockRejectedValueOnce(new UnauthorizedException());
    const service = new AuthService(jwtService as any, config as any, prisma as any, sessions as any, emailVerification as any);
    await expect(service.register('normal-user', 'long-enough-password', 'normal@example.com', '11111111-1111-4111-8111-111111111111', '000000'))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
  it('注册验证码请求不向已被占用的邮箱发送邮件，且保持响应结构一致', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'existing-user' });
    const service = new AuthService(jwtService as any, config as any, prisma as any, sessions as any, emailVerification as any);
    const result = await service.requestRegistrationCode(' Person@Example.com ');
    expect(result.challengeId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(emailVerification.issue).not.toHaveBeenCalled();
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { email: { equals: 'person@example.com', mode: 'insensitive' } },
      select: { id: true },
    });
  });
  it('未验证旧账号登录先返回邮箱认领流程而不签发会话', async () => {
    const passwordHash = await (new AuthService(jwtService as any, config as any, prisma as any, sessions as any, emailVerification as any) as any).hashPassword('long-enough-password');
    prisma.user.findUnique.mockResolvedValue({ id: 'normal-user', email: 'normal@example.com', emailVerifiedAt: null, passwordHash, role: 'USER', name: null });
    const service = new AuthService(jwtService as any, config as any, prisma as any, sessions as any, emailVerification as any);
    const result = await service.login({ userId: 'normal-user', password: 'long-enough-password' });
    expect(result).toMatchObject({ requiresEmailClaim: true, userId: 'normal-user' });
    expect(emailVerification.issue).not.toHaveBeenCalled();
    expect(sessions.issue).not.toHaveBeenCalled();
  });
  it('旧账号认领邮箱前必须验证原密码，并把验证码绑定到账号和规范化邮箱', async () => {
    const service = new AuthService(jwtService as any, config as any, prisma as any, sessions as any, emailVerification as any);
    const passwordHash = await (service as any).hashPassword('long-enough-password');
    prisma.user.findUnique.mockResolvedValue({ id: 'normal-user', email: 'normal@local', emailVerifiedAt: null, passwordHash, role: 'USER' });

    await expect(service.requestLegacyEmailClaim('normal-user', 'wrong-password-123', 'owner@example.com'))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(emailVerification.issue).not.toHaveBeenCalled();

    await service.requestLegacyEmailClaim('normal-user', 'long-enough-password', ' Owner@Example.com ');
    expect(emailVerification.issue).toHaveBeenCalledWith('email-claim', 'owner@example.com', 'normal-user');
  });
  it('旧账号邮箱认领消费指定账号和邮箱的一次性验证码并原子验证邮箱后才签发会话', async () => {
    const service = new AuthService(jwtService as any, config as any, prisma as any, sessions as any, emailVerification as any);
    const user = { id: 'normal-user', email: 'normal@local', emailVerifiedAt: null, passwordHash: 'salt:hash', role: 'USER', name: null };
    prisma.user.findUnique.mockResolvedValue(user);
    await service.verifyLegacyEmailClaim('normal-user', ' Owner@Example.com ', '11111111-1111-4111-8111-111111111111', '123456');

    expect(emailVerification.consume).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', 'email-claim', '123456', 'normal-user', 'owner@example.com');
    expect(sessions.changePassword).toHaveBeenCalledWith('normal-user', expect.any(Function));
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'normal-user', email: 'normal@local', emailVerifiedAt: null, passwordHash: 'salt:hash' },
      data: { email: 'owner@example.com', emailVerifiedAt: expect.any(Date) },
    });
    expect(sessions.issue).toHaveBeenCalledWith({ ...user, email: 'owner@example.com' }, '0');
  });
  it('找回密码只对已验证邮箱发码并在成功后吊销所有会话', async () => {
    const service = new AuthService(jwtService as any, config as any, prisma as any, sessions as any, emailVerification as any);
    const passwordHash = await (service as any).hashPassword('long-enough-password');
    const verifiedAt = new Date('2026-11-04T00:00:00.000Z');
    const user = { id: 'normal-user', email: 'normal@example.com', emailVerifiedAt: verifiedAt, passwordHash, role: 'USER', name: null };
    prisma.user.findUnique.mockResolvedValue(user);
    const request = await service.requestPasswordReset('normal-user');
    expect(request.accepted).toBe(true);
    expect(emailVerification.issue).toHaveBeenCalledWith('password-reset', user.email, user.id);
    emailVerification.consume.mockResolvedValueOnce({ userId: user.id, subject: 'email-subject' });
    await service.resetPassword(user.id, request.challengeId, '123456', 'new-long-password');
    expect(sessions.changePassword).toHaveBeenCalledWith(user.id, expect.any(Function));
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: user.id, email: user.email, emailVerifiedAt: verifiedAt, passwordHash },
      data: { passwordHash: expect.any(String) },
    });
    expect(prisma.user.updateMany.mock.calls[prisma.user.updateMany.mock.calls.length - 1][0].data.passwordHash).not.toBe(passwordHash);
  });
  it('uses the verified email to recover the same account without needing its username', async () => {
    const user = { id: 'normal-user', email: 'normal@example.com', emailVerifiedAt: new Date(), passwordHash: 'salt:hash' };
    prisma.user.findFirst.mockResolvedValue(user);
    const service = new AuthService(jwtService as any, config as any, prisma as any, sessions as any, emailVerification as any);
    const requested = await service.requestPasswordReset(' Normal@Example.com ');
    expect(emailVerification.issue).toHaveBeenCalledWith('password-reset', user.email, user.id);
    await service.resetPassword('normal@example.com', requested.challengeId, '123456', 'new-long-password');
    expect(emailVerification.consume).toHaveBeenCalledWith(requested.challengeId, 'password-reset', '123456', user.id);
    expect(sessions.changePassword).toHaveBeenCalledWith(user.id, expect.any(Function));
  });

  it('does not issue reset codes or change passwords for an unknown or unverified email', async () => {
    const service = new AuthService(jwtService as any, config as any, prisma as any, sessions as any, emailVerification as any);
    prisma.user.findFirst.mockResolvedValue(null);
    expect(await service.requestPasswordReset('unknown@example.com')).toHaveProperty('accepted', true);
    prisma.user.findFirst.mockResolvedValue({ id: 'legacy-user', emailVerifiedAt: null });
    expect(await service.requestPasswordReset('legacy@example.com')).toHaveProperty('accepted', true);
    await expect(service.resetPassword('legacy@example.com', '11111111-1111-4111-8111-111111111111', '123456', 'new-long-password')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(emailVerification.issue).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('重置码不能用于错误账号或未验证账号', async () => {
    const service = new AuthService(jwtService as any, config as any, prisma as any, sessions as any, emailVerification as any);
    emailVerification.consume.mockRejectedValueOnce(new UnauthorizedException());
    await expect(service.resetPassword('normal-user', '11111111-1111-4111-8111-111111111111', '123456', 'new-long-password'))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    prisma.user.findUnique.mockResolvedValue({ id: 'normal-user', email: 'legacy@local', emailVerifiedAt: null, passwordHash: 'salt:hash' });
    emailVerification.consume.mockResolvedValueOnce({ userId: 'normal-user', subject: 'email-subject' });
    await expect(service.resetPassword('normal-user', '11111111-1111-4111-8111-111111111111', '123456', 'new-long-password'))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
  it('改密码校验旧密码并通过会话锁执行条件更新', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const service = new AuthService(jwtService as any, config as any, prisma as any, sessions as any, emailVerification as any);
    await service.register('normal-user', 'long-enough-password', 'normal@example.com', '11111111-1111-4111-8111-111111111111', '123456');
    const created = prisma.user.create.mock.calls[0][0].data;
    prisma.user.findUnique.mockResolvedValue({ ...created, emailVerifiedAt: new Date() });
    await service.changePassword('normal-user', 'long-enough-password', 'new-long-password', '11111111-1111-4111-8111-111111111111', '123456');
    expect(emailVerification.consume).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', 'password-change', '123456', 'normal-user');
    expect(sessions.changePassword).toHaveBeenCalledWith('normal-user', expect.any(Function));
    expect(prisma.user.updateMany).toHaveBeenCalledWith({ where: { id: 'normal-user', email: 'normal@example.com', emailVerifiedAt: expect.any(Date), passwordHash: created.passwordHash }, data: { passwordHash: expect.any(String) } });
    expect(prisma.user.updateMany.mock.calls[0][0].data.passwordHash).not.toBe(created.passwordHash);
  });
  it('错误旧密码不会更新或吊销会话', async () => {
    prisma.user.findUnique.mockResolvedValue({ passwordHash: 'invalid:hash' });
    const service = new AuthService(jwtService as any, config as any, prisma as any, sessions as any, emailVerification as any);
    await expect(service.changePassword('normal-user', 'wrong-password-123', 'new-long-password', '11111111-1111-4111-8111-111111111111', '123456')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(sessions.changePassword).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

});
