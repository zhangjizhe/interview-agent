import { BadRequestException } from '@nestjs/common';
import { lookup } from 'dns/promises';
import { Agent, get } from 'https';
import { BlockList, isIP } from 'net';

export class SsrfBlockedException extends BadRequestException {}

const blocked = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blocked.addSubnet(network, prefix, 'ipv4');
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
for (const [network, prefix] of [['2001::', 32], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20]] as const) blocked.addSubnet(network, prefix, 'ipv6');

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, 'ipv4');
  // 拒绝映射 IPv4、链路本地、ULA、多播与过渡网络，避免不同解析栈的地址语义差异。
  return family === 6 && globalV6.check(address, 'ipv6') && !blocked.check(address, 'ipv6');
}

export function assertSafeExternalUrl(rawUrl: string): void {
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw new BadRequestException('invalid url'); }
  if (url.protocol !== 'https:') throw new BadRequestException('url must use https');
  if (url.username || url.password) throw new BadRequestException('url must not contain credentials');
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (host === 'localhost' || /\.(localhost|local|internal)$/.test(host)) throw new SsrfBlockedException('url blocked: internal hostname');
  if (isIP(host) && !isPublicAddress(host)) throw new SsrfBlockedException('url blocked: non-public address');
}

type Address = { address: string; family: number };
const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 10000;

async function resolveAddresses(url: URL, remaining: number): Promise<Address[]> {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) return [{ address: host, family: isIP(host) }];
  let timer: NodeJS.Timeout | undefined;
  try {
    const addresses = await Promise.race([
      lookup(host, { all: true, verbatim: true }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new BadRequestException('URL DNS 解析超时')), remaining); }),
    ]);
    if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) throw new SsrfBlockedException('url blocked: DNS contains non-public address');
    return addresses;
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException('URL DNS 解析失败');
  } finally { if (timer) clearTimeout(timer); }
}

async function readHop(url: URL, addresses: Address[], remaining: number): Promise<{ status: number; location?: string; body: string }> {
  // 原始 hostname 保留 Host/SNI 与 TLS 证书验证；lookup 回调只返回刚刚验证的 IP，不再查询 DNS。
  const agent = new Agent({ keepAlive: false, lookup: ((_host: string, options: any, callback: any) => {
    if (options?.all) callback(null, addresses);
    else callback(null, addresses[0].address, addresses[0].family);
  }) as any });
  try {
    return await new Promise((resolve, reject) => {
      let settled = false;
      let timer: NodeJS.Timeout;
      const finish = (error?: Error, result?: { status: number; location?: string; body: string }) => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        if (error) reject(error); else resolve(result!);
      };
      // Node https 不自动跟随重定向，等价 maxRedirects: 0，下一跳由外层重新校验。
      const request = get(url, { agent, headers: { 'User-Agent': 'InterviewBot/1.0', 'Accept-Encoding': 'identity' } }, response => {
        const status = response.statusCode || 502;
        if (status >= 300 && status < 400) {
          finish(undefined, { status, location: response.headers.location, body: '' });
          response.destroy(); return;
        }
        if (status < 200 || status >= 300) { finish(new BadRequestException(`URL 抓取失败：HTTP ${status}`)); response.destroy(); return; }
        if (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') {
          finish(new BadRequestException('URL 返回不支持的压缩格式')); response.destroy(); return;
        }
        const chunks: Buffer[] = []; let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES) { finish(new BadRequestException('URL 响应超过大小限制')); response.destroy(); request.destroy(); return; }
          chunks.push(chunk);
        });
        response.on('end', () => finish(undefined, { status, body: Buffer.concat(chunks).toString('utf8') }));
        response.on('error', () => finish(new BadRequestException('URL 响应读取失败')));
        response.on('aborted', () => finish(new BadRequestException('URL 响应中断')));
      });
      timer = setTimeout(() => { finish(new BadRequestException('URL 抓取超时')); request.destroy(); }, remaining);
      request.on('error', () => finish(new BadRequestException('URL 连接失败')));
    });
  } finally { agent.destroy(); }
}

export async function fetchSafeExternalText(rawUrl: string): Promise<string> {
  const deadline = Date.now() + TIMEOUT_MS;
  let current = rawUrl;
  for (let redirects = 0; redirects <= 3; redirects++) {
    assertSafeExternalUrl(current);
    const url = new URL(current);
    if (Date.now() >= deadline) throw new BadRequestException('URL 抓取超时');
    const addresses = await resolveAddresses(url, deadline - Date.now());
    if (Date.now() >= deadline) throw new BadRequestException('URL 抓取超时');
    const result = await readHop(url, addresses, deadline - Date.now());
    if (result.status >= 300 && result.status < 400) {
      if (!result.location || redirects === 3) throw new BadRequestException('URL 重定向次数超限或缺少目标');
      try { current = new URL(result.location, url).toString(); } catch { throw new BadRequestException('URL 重定向目标无效'); }
    } else return result.body;
  }
  throw new BadRequestException('URL 重定向次数超限');
}
