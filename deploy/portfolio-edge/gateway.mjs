import http from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile, unlink } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const CONTRACT = 'portfolio-assistant/v1';
const TICKET_PATH = /^\/api\/portfolio-assistant\/answers\/[a-f0-9]{48}\.[A-Za-z0-9_-]{43}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const keys = new Set(['contractVersion', 'status', 'ticket', 'reused', 'pollAfterMs', 'reason', 'answer', 'sources', 'sourceRevision', 'evidenceMode']);
const digest = text => createHash('sha256').update(text).digest();
const json = (status, error) => new Response(JSON.stringify({ error }), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
async function boundedBytes(stream, limit) {
  if (!stream) throw Error('empty');
  const reader = stream.getReader(), parts = []; let size = 0;
  try { while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > limit) { await reader.cancel(); throw Error('size'); } parts.push(value); } }
  finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0; for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return bytes;
}
export function createPortfolioGateway({ upstream, publicOrigin, secret, fetcher = fetch }) {
  const base = new URL(upstream), site = new URL(publicOrigin);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.pathname !== '/' || base.search || base.hash
    || site.protocol !== 'https:' || site.origin !== publicOrigin || typeof secret !== 'string' || !/^[A-Za-z0-9_-]{32,256}$/.test(secret)) throw Error('Invalid private gateway configuration');
  const expected = digest(secret);
  return async request => {
    const url = new URL(request.url), chat = url.pathname === '/api/portfolio-assistant/chat';
    if ((!chat && !TICKET_PATH.test(url.pathname)) || url.search) return json(404, '接口不存在。');
    if (request.method !== (chat ? 'POST' : 'GET')) return json(405, '请求方法不支持。');
    const supplied = request.headers.get('X-Portfolio-Gateway-Key') || '';
    if (supplied.length > 256 || !timingSafeEqual(expected, digest(supplied))) return json(401, '接入认证失败。');
    if (request.headers.get('Origin') !== publicOrigin) return json(403, '该来源未开放。');
    let body;
    if (chat) {
      if (!request.headers.get('content-type')?.startsWith('application/json')) return json(415, '请使用 JSON 请求。');
      try {
        const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await boundedBytes(request.body, 4096)));
        if (!data || Object.keys(data).some(key => !['message', 'requestKey'].includes(key)) || typeof data.message !== 'string'
          || !data.message.trim() || data.message.length > 500 || Buffer.byteLength(data.message, 'utf8') > 1500 || !UUID.test(data.requestKey || '')) return json(400, '问题或请求标识无效。');
        body = JSON.stringify({ message: data.message, requestKey: data.requestKey });
      } catch { return json(400, '请求格式或大小无效。'); }
    }
    try {
      const response = await fetcher(new URL(url.pathname, base).href, { method: request.method, headers: { 'Content-Type': 'application/json', Origin: publicOrigin },
        ...(body ? { body } : {}), redirect: 'error', signal: AbortSignal.any([request.signal, AbortSignal.timeout(12000)]) });
      if (!response.ok) return json([400, 401, 403, 404, 409, 429, 503].includes(response.status) ? response.status : 502, '助手暂不可用或请求未确认，请保留原问题及请求标识。');
      if (!response.headers.get('content-type')?.includes('application/json')) return json(502, '后端回执格式异常。');
      const bytes = await boundedBytes(response.body, 65536), data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      if (data?.contractVersion !== CONTRACT || !['PENDING', 'RUNNING', 'COMPLETED', 'REFUSED', 'FAILED'].includes(data.status)
        || Object.keys(data).some(key => !keys.has(key))) return json(502, '后端回执未通过公开合同检查。');
      return new Response(bytes, { status: response.status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
    } catch { return json(502, '助手连接未确认，请保留原问题及请求标识。'); }
  };
}
export async function startPortfolioGateway(env = process.env) {
  const secretFile = env.PORTFOLIO_GATEWAY_SECRET_FILE || '/run/secrets/portfolio-gateway-key';
  const secret = (await readFile(secretFile, 'utf8')).trim();
  const handle = createPortfolioGateway({ upstream: env.PORTFOLIO_GATEWAY_UPSTREAM || 'http://api:3001', publicOrigin: env.PORTFOLIO_GATEWAY_PUBLIC_ORIGIN, secret });
  await unlink(secretFile);
  const { Readable } = await import('node:stream');
  const server = http.createServer(async (req, res) => {
    const abort = new AbortController(); req.once('aborted', () => abort.abort());
    try {
      const request = new Request('http://gateway.invalid' + req.url, { method: req.method, headers: req.headers, signal: abort.signal,
        ...(!['GET', 'HEAD'].includes(req.method) ? { body: Readable.toWeb(req), duplex: 'half' } : {}) });
      const response = await handle(request); res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
    } catch { res.writeHead(400, { 'Cache-Control': 'no-store' }); res.end(); }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000;
  server.listen(Number(env.PORT || 8080), env.HOST || '0.0.0.0', () => console.log('Restricted portfolio gateway ready; credentials and answer URLs are not logged.'));
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await startPortfolioGateway();
