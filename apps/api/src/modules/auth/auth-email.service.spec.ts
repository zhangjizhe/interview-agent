import nodemailer from 'nodemailer';
import { Logger } from '@nestjs/common';
import { lookup } from 'dns/promises';
import { AuthEmailService } from './auth-email.service';

jest.mock('nodemailer', () => ({ __esModule: true, default: { createTransport: jest.fn() } }));
jest.mock('dns/promises', () => ({ lookup: jest.fn() }));

describe('AuthEmailService one-time email challenges', () => {
  const values = new Map<string, string>();
  const createTransport = nodemailer.createTransport as jest.Mock;
  let sendMail: jest.Mock;
  let sent: string;
  let dailyTtlSeconds = 0;
  let configuredDailyLimit = 8;
  let service: AuthEmailService;

  beforeEach(() => {
    values.clear(); sent = ''; configuredDailyLimit = 8;
    jest.clearAllMocks();
    (lookup as jest.Mock).mockResolvedValue([]);
    dailyTtlSeconds = 0;
    sendMail = jest.fn(async (mail: { text: string }) => { sent = mail.text; });
    createTransport.mockReturnValue({ sendMail, close: jest.fn() });
    const redis = { getClient: () => ({
      get: async (key: string) => values.get(key) ?? null,
      set: async (key: string, value: string) => { values.set(key, value); return 'OK'; },
      del: async (key: string) => values.delete(key),
      eval: async (script: string, _keyCount: number, ...args: string[]) => {
        if (script.includes("redis.call('EXISTS'")) {
          const [cooldown, daily, max, cooldownSeconds, dailySeconds] = args;
          expect(cooldownSeconds).toBe('60');
          dailyTtlSeconds = Number(dailySeconds);
          const count = Number(values.get(daily) || 0);
          if (values.has(cooldown)) return 0;
          if (count >= Number(max)) return -1;
          values.set(cooldown, '1'); values.set(daily, String(count + 1)); return 1;
        }
        const [key, purpose, expectedUserId, digest] = args;
        const raw = values.get(key);
        if (!raw) return [0, ''];
        const record = JSON.parse(raw);
        if (record.purpose !== purpose || (expectedUserId && record.userId !== expectedUserId)) return [0, ''];
        if (record.digest !== digest) {
          record.attempts += 1;
          if (record.attempts >= 5) values.delete(key); else values.set(key, JSON.stringify(record));
          return [0, ''];
        }
        values.delete(key); return [1, raw];
      },
    }) } as any;
    const config = { get: (key: string) => ({
      'auth.emailOtpSecret': 'a'.repeat(48),
      'auth.emailDailyLimit': configuredDailyLimit,
      'auth.emailSmtpHost': 'smtp.example.test',
      'auth.emailSmtpPort': 587,
      'auth.emailSmtpSecure': false,
      'auth.emailSmtpUser': 'fixture',
      'auth.emailSmtpPassword': 'fixture-only',
      'auth.emailFrom': 'noreply@example.test',
    }[key]) };
    service = new AuthEmailService(redis, config as any);
  });

  it('normalizes address, binds the code to purpose and consumes it exactly once', async () => {
    const { challengeId } = await service.issue('registration', ' Person@Example.com ');
    const code = sent.match(/\b\d{6}\b/)?.[0];
    expect(code).toMatch(/^\d{6}$/);
    expect(sent).toContain('注册邮箱验证');
    expect(sendMail.mock.calls[0][0].subject).toBe('Interview Agent 注册邮箱验证码');
    await expect(service.consume(challengeId, 'login', code!)).rejects.toMatchObject({ status: 401 });
    await expect(service.consume(challengeId, 'registration', code!, undefined, 'person@example.com'))
      .resolves.toMatchObject({ subject: service.emailSubject('registration', 'person@example.com') });
    await expect(service.consume(challengeId, 'registration', code!)).rejects.toMatchObject({ status: 401 });
    await expect(service.consume(challengeId, 'login', code!)).rejects.toMatchObject({ status: 401 });
  });

  it('stores only purpose-bound HMAC material in Redis and allows only one concurrent consumption', async () => {
    const { challengeId } = await service.issue('login', 'person@example.com', 'user-1');
    const code = sent.match(/\b\d{6}\b/)![0];
    const stored = [...values.entries()].find(([key]) => key.includes(challengeId));
    expect(stored).toBeDefined();
    expect(stored![0]).not.toContain('person@example.com');
    expect(stored![1]).not.toContain(code);
    const results = await Promise.allSettled([
      service.consume(challengeId, 'login', code, 'user-1', 'person@example.com'),
      service.consume(challengeId, 'login', code, 'user-1', 'person@example.com'),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
  });

  it('clears an unusable challenge and reports service unavailable when SMTP delivery fails', async () => {
    sendMail.mockRejectedValueOnce(new Error('fixture transport failure'));
    await expect(service.issue('registration', 'person@example.com')).rejects.toMatchObject({ status: 503 });
    expect([...values.keys()].some(key => key.includes('auth:email-challenge:'))).toBe(false);
  });

  it.each([
    [{ code: 'ETIMEDOUT', command: 'CONN', timeoutType: 'GREETING_TIMEOUT' }, 'code=ETIMEDOUT, status=UNKNOWN, phase=CONN, timeout=GREETING_TIMEOUT'],
    [{ code: 'credential-secret', command: 'AUTH private-credential', responseCode: 'private-status', timeoutType: 'private-timeout' }, 'code=UNKNOWN, status=UNKNOWN, phase=UNKNOWN'],
  ])('logs only allowlisted SMTP metadata while keeping delivery failures closed', async (metadata, expected) => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    try {
      sendMail.mockRejectedValueOnce(Object.assign(new Error('private-password person@example.com 123456'), metadata, {
        response: 'private-response person@example.com 123456',
      }));
      await expect(service.issue('registration', 'person@example.com')).rejects.toMatchObject({ status: 503 });
      expect([...values.keys()].some(key => key.includes('auth:email-challenge:'))).toBe(false);
      const log = warn.mock.calls.flat().join(' ');
      expect(log).toContain(expected);
      for (const secret of ['private-', 'credential-secret', 'person@example.com', '123456']) expect(log).not.toContain(secret);
    } finally { warn.mockRestore(); }
  });

  it('rejects codes for another address and limits guessing attempts', async () => {
    const { challengeId } = await service.issue('email-claim', 'person@example.com', 'user-1');
    const realCode = sent.match(/\b\d{6}\b/)![0];
    const wrongCode = realCode === '000000' ? '000001' : '000000';
    await expect(service.consume(challengeId, 'email-claim', '000000', 'user-1', 'other@example.com'))
      .rejects.toMatchObject({ status: 401 });
    for (let attempt = 0; attempt < 5; attempt++) {
      await expect(service.consume(challengeId, 'email-claim', wrongCode, 'user-1', 'person@example.com'))
        .rejects.toMatchObject({ status: 401 });
    }
    await expect(service.consume(challengeId, 'email-claim', realCode, 'user-1', 'person@example.com'))
      .rejects.toMatchObject({ status: 401 });
  });

  it('reuses the same challenge on a bounded pre-message fallback and keeps TLS anchored to the configured host', async () => {
    (lookup as jest.Mock).mockResolvedValue([{ address: '192.0.2.1', family: 4 }]);
    sendMail.mockRejectedValueOnce(Object.assign(new Error('fixture greeting timeout'), { code: 'ETIMEDOUT', timeoutType: 'GREETING_TIMEOUT' }));
    const result = await service.issue('login', 'person@example.com', 'user-1');
    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(sendMail.mock.calls[1][0]).toEqual(sendMail.mock.calls[0][0]);
    expect(createTransport.mock.calls[1][0]).toMatchObject({
      host: '192.0.2.1', secure: false, requireTLS: true,
      tls: { servername: 'smtp.example.test', rejectUnauthorized: true },
    });
    expect([...values.entries()].filter(([key]) => key.startsWith('auth:email-daily:')).map(([, value]) => value)).toEqual(['1']);
    const code = sent.match(/\b\d{6}\b/)![0];
    await expect(service.consume(result.challengeId, 'login', code, 'user-1', 'person@example.com')).resolves.toBeDefined();
  });

  it.each(['SOCKET_TIMEOUT', 'UPGRADE_TIMEOUT'])('does not retry ambiguous or later-stage timeout %s', async (timeoutType) => {
    sendMail.mockRejectedValueOnce(Object.assign(new Error('private mail failure'), { code: 'ETIMEDOUT', timeoutType }));
    await expect(service.issue('login', 'person@example.com', 'user-1')).rejects.toMatchObject({ status: 503 });
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(lookup).not.toHaveBeenCalled();
    expect([...values.keys()].some(key => key.startsWith('auth:email-challenge:'))).toBe(false);
  });

  it('caps address fallback at two unique valid addresses and keeps all-attempt failure closed', async () => {
    (lookup as jest.Mock).mockResolvedValue([
      { address: '192.0.2.1' }, { address: '192.0.2.1' }, { address: 'not-an-address' },
      { address: '192.0.2.2' }, { address: '192.0.2.3' },
    ]);
    sendMail.mockRejectedValue(Object.assign(new Error('fixture setup timeout'), { code: 'ETIMEDOUT', timeoutType: 'CONNECT_TIMEOUT' }));
    await expect(service.issue('login', 'person@example.com', 'user-1')).rejects.toMatchObject({ status: 503 });
    expect(sendMail).toHaveBeenCalledTimes(3);
    expect(createTransport.mock.calls.slice(1).map(([options]) => options.host)).toEqual(['192.0.2.1', '192.0.2.2']);
    expect([...values.keys()].some(key => key.startsWith('auth:email-challenge:'))).toBe(false);
  });

  it('enforces the configured deployment send limit while retaining the daily counter', async () => {
    configuredDailyLimit = 3;
    for (let attempt = 0; attempt < 3; attempt++) {
      await service.issue('registration', 'person@example.com');
      for (const key of values.keys()) if (key.startsWith('auth:email-rate:')) values.delete(key);
    }
    await expect(service.issue('registration', 'person@example.com')).rejects.toMatchObject({ status: 429 });
    expect(sendMail).toHaveBeenCalledTimes(3);
  });

  it.each([0, 21, 1.5])('fails closed on invalid send limit %s without sending or consuming quota', async (limit) => {
    configuredDailyLimit = limit;
    await expect(service.issue('registration', 'person@example.com')).rejects.toMatchObject({ status: 503 });
    expect(sendMail).not.toHaveBeenCalled();
    expect(values.size).toBe(0);
  });

  it('limits each address to eight codes per UTC day and expires the counter at the day boundary', async () => {
    for (let attempt = 0; attempt < 8; attempt++) {
      await service.issue('registration', 'person@example.com');
      for (const key of values.keys()) if (key.startsWith('auth:email-rate:')) values.delete(key);
    }
    await expect(service.issue('registration', 'person@example.com')).rejects.toMatchObject({ status: 429 });
    expect(dailyTtlSeconds).toBeGreaterThan(0);
    expect(dailyTtlSeconds).toBeLessThanOrEqual(24 * 60 * 60);
    expect(sendMail).toHaveBeenCalledTimes(8);
  });
});
