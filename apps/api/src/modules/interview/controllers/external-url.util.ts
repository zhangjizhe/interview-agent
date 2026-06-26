import { BadRequestException } from '@nestjs/common';

/**
 * SSRF 防护：校验外部 URL 安全性（修复 P0-3）。
 *
 * 防御策略（最小可行版，demo 阶段）：
 * - 强制 https（拒绝 file://、http://、gopher:// 等）
 * - 拒绝常见内网 / loopback / link-local IP 字面量
 *   （127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16,
 *    169.254.0.0/16 含 AWS metadata 169.254.169.254, 0.0.0.0/8）
 * - 拒绝 localhost / *.local / *.internal
 * - 拒绝 IPv6 字面量（demo 阶段简化）
 *
 * 已知限制（不修复，留给网络层）：
 * - DNS rebinding：攻击者用 attacker.com 解析到 127.0.0.1，本校验不拦截
 *   商用应配合 eBPF / sidecar（e.g. Istio OutboundTrafficPolicy）或自定义
 *   undici Agent 解析 → IP → 校验后用 IP 发起请求
 *
 * 抛 BadRequestException 让前端显示明确错误（不静默拒绝）。
 */
export function assertSafeExternalUrl(rawUrl: string): void {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new BadRequestException('invalid url');
  }

  if (url.protocol !== 'https:') {
    throw new BadRequestException(`url must use https (got ${url.protocol})`);
  }

  const host = url.hostname.toLowerCase();

  if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1') {
    throw new BadRequestException(`url blocked: ${host} is a loopback address`);
  }

  const blockedPatterns: RegExp[] = [
    /^10\./,                              // 10.0.0.0/8
    /^192\.168\./,                        // 192.168.0.0/16
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,     // 172.16.0.0/12
    /^169\.254\./,                        // 169.254.0.0/16 (link-local, AWS metadata!)
    /^0\./,                               // 0.0.0.0/8
    /\.internal$/,
    /\.local$/,
  ];
  for (const pat of blockedPatterns) {
    if (pat.test(host)) {
      throw new BadRequestException(`url blocked: ${host} is in a private/internal range`);
    }
  }

  // IPv6 字面量（除 ::1 已在前面拒绝）：demo 阶段直接禁
  if (host.includes(':')) {
    throw new BadRequestException(`url blocked: IPv6 literal not allowed in demo`);
  }
}