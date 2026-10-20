import { createRequire } from 'node:module';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

// Exercise the installed Mem0 -> Axios transport chain, never a cloud endpoint.
const memoryRequire = createRequire(require.resolve('mem0ai'));
const axiosRequire = createRequire(memoryRequire.resolve('axios'));
const redirects = axiosRequire('follow-redirects');
const listen = (server: Server) => new Promise<number>(resolve => server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port)));
const close = (server: Server) => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));

describe('installed redirect transport credential boundary', () => {
  it.each(['array', 'special-names'])('strips cross-host credential headers (%s) while completing a normal redirect', async mode => {
    const target = createServer((request, response) => { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(request.headers)); });
    const port = await listen(target);
    const source = createServer((_request, response) => { response.writeHead(302, { Location: `http://127.0.0.1:${port}/final` }); response.end(); });
    const sourcePort = await listen(source);
    try {
      const sensitiveHeaders = ['x-fixture^secret', 'x-fixture|secret'];
      const fields = { Authorization: 'synthetic', Cookie: 'synthetic=1', 'Proxy-Authorization': 'synthetic', 'x-fixture^secret': 'synthetic', 'x-fixture|secret': 'synthetic', 'x-public-fixture': 'retained' };
      const headers = mode === 'array' ? Object.entries(fields).flat() : fields;
      const received: any = await new Promise((resolve, reject) => {
        const request = redirects.http.get({ hostname: 'localhost', port: sourcePort, path: '/', headers, sensitiveHeaders,
          lookup: (_hostname: string, options: any, callback: any) => options.all ? callback(null, [{ address: '127.0.0.1', family: 4 }]) : callback(null, '127.0.0.1', 4),
        }, (response: any) => {
          let body = ''; response.setEncoding('utf8'); response.on('data', (chunk: string) => { body += chunk; });
          response.on('end', () => { try { resolve(JSON.parse(body)); } catch (error) { reject(error); } }); response.on('error', reject);
        });
        request.setTimeout(3000, () => request.destroy(new Error('Local redirect fixture timeout'))); request.on('error', reject);
      });
      expect(received['x-public-fixture']).toBe('retained');
      for (const name of ['authorization', 'cookie', 'proxy-authorization', ...sensitiveHeaders]) expect(received[name]).toBeUndefined();
    } finally { await Promise.all([close(source), close(target)]); }
  });
});
