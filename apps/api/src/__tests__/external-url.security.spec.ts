import * as dns from 'dns/promises';
import * as https from 'https';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { assertSafeExternalUrl, fetchSafeExternalText, isPublicAddress } from '../modules/interview/controllers/external-url.util';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
jest.mock('https', () => { const actual = jest.requireActual('https'); return { ...actual, get: jest.fn() }; });

describe('URL 抓取 SSRF 防护', () => {
  const lookup = dns.lookup as jest.Mock;
  const get = https.get as jest.Mock;
  beforeEach(() => {
    jest.clearAllMocks(); lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    reply(200, {}, 'public document');
  });
  function reply(status: number, headers: Record<string, string>, body = '') {
    get.mockImplementation((_url: URL, _options: any, cb: any) => {
      const req: any = new EventEmitter(); req.destroy = jest.fn();
      queueMicrotask(() => { const res: any = new PassThrough(); res.statusCode = status; res.headers = headers; cb(res); res.end(body); });
      return req;
    });
  }
  it.each(['127.0.0.1', '10.0.0.1', '100.64.0.1', '169.254.169.254', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1'])('拒绝非公网 %s', address => { expect(isPublicAddress(address)).toBe(false); });
  it('允许普通公网 IPv4 和 IPv6', () => { expect(isPublicAddress('93.184.216.34')).toBe(true); expect(isPublicAddress('2606:4700:4700::1111')).toBe(true); });
  it('混合 DNS 记录包含私网时整次拒绝', async () => {
    lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }, { address: '::1', family: 6 }]);
    await expect(fetchSafeExternalText('https://example.com')).rejects.toMatchObject({ status: 400 }); expect(get).not.toHaveBeenCalled();
  });
  it('DNS rebinding 不触发二次解析，连接固定为已验证 IP', async () => {
    lookup.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }]).mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    await expect(fetchSafeExternalText('https://example.com')).resolves.toBe('public document');
    const agent = get.mock.calls[0][1].agent;
    const callback = jest.fn(); agent.options.lookup('example.com', {}, callback);
    expect(callback).toHaveBeenCalledWith(null, '93.184.216.34', 4); expect(lookup).toHaveBeenCalledTimes(1);
  });
  it('重定向私网拒绝且不发起第二跳请求', async () => {
    reply(302, { location: 'https://127.0.0.1/private' });
    await expect(fetchSafeExternalText('https://example.com')).rejects.toMatchObject({ status: 400 }); expect(get).toHaveBeenCalledTimes(1);
  });
  it('最多允许三次重定向', async () => {
    reply(302, { location: '/next' });
    await expect(fetchSafeExternalText('https://example.com')).rejects.toThrow('重定向'); expect(get).toHaveBeenCalledTimes(4);
  });
  it('正常公网文本可以抓取', async () => { await expect(fetchSafeExternalText('https://example.com')).resolves.toBe('public document'); });
  it('响应体超限明确失败', async () => { reply(200, {}, 'x'.repeat(2 * 1024 * 1024 + 1)); await expect(fetchSafeExternalText('https://example.com')).rejects.toThrow('大小'); });
  it.each(['http://example.com', 'https://user:pass@example.com', 'https://localhost', 'https://host.internal'])('拒绝不安全 URL %s', url => { expect(() => assertSafeExternalUrl(url)).toThrow(); });
});
