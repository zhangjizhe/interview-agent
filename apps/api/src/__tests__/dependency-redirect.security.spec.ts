import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ConfigService } from '@nestjs/config';
import { Mem0CloudMemory } from '../modules/memory/long-term/mem0.store';

const listen = (server: Server) => new Promise<number>(resolve => server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port)));
const close = (server: Server) => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));

// Mem0CloudMemory uses native fetch; the unused Mem0 SDK/Axios chain is removed.
// Exercise the actual product transport against loopback fixtures only.
describe('Mem0 REST transport credential boundary', () => {
  it.each([false, true])('preserves POST payload across a redirect; cross-origin=%s', async crossOrigin => {
    const received: Array<{ authorization?: string; method?: string; body: unknown }> = [];
    const capture = (request: IncomingMessage, response: ServerResponse) => {
      let body = '';
      request.setEncoding('utf8');
      request.on('data', chunk => { body += chunk; });
      request.on('end', () => {
        received.push({ authorization: request.headers.authorization, method: request.method, body: JSON.parse(body) });
        response.setHeader('Content-Type', 'application/json');
        response.end('{}');
      });
    };
    const target = createServer(capture);
    const targetPort = await listen(target);
    const source = createServer((request, response) => {
      if (request.url === '/final') return capture(request, response);
      response.writeHead(307, { Location: crossOrigin ? `http://127.0.0.1:${targetPort}/final` : '/final' });
      response.end();
    });
    const sourcePort = await listen(source);
    try {
      const memory = new Mem0CloudMemory(new ConfigService({ mem0: { apiKey: 'synthetic-fixture-key' } }));
      // Suppress only startup's delayed probe; memorize still uses real native fetch.
      jest.useFakeTimers();
      try { await memory.onModuleInit(); } finally { jest.clearAllTimers(); jest.useRealTimers(); }
      (memory as unknown as { baseUrl: string }).baseUrl = `http://127.0.0.1:${sourcePort}`;
      expect(memory.isEnabled()).toBe(true);
      expect(memory.getMode()).toBe('cloud');
      await memory.memorize('fixture-user', [{ role: 'user', content: 'fixture memory' }]);
      expect(received).toEqual([{
        authorization: crossOrigin ? undefined : 'Token synthetic-fixture-key',
        method: 'POST',
        body: { user_id: 'fixture-user', messages: [{ role: 'user', content: 'fixture memory' }] },
      }]);
    } finally { await Promise.all([close(source), close(target)]); }
  });
});
