import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';

const apiRequire = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const sdkRequire = createRequire(apiRequire.resolve('@modelcontextprotocol/sdk/server/streamableHttp.js'));
const adapterRoot = dirname(dirname(sdkRequire.resolve('@hono/node-server')));
const manifest = JSON.parse(readFileSync(join(adapterRoot, 'package.json'), 'utf8'));
const { Hono } = sdkRequire('hono');
const root = mkdtempSync(join(tmpdir(), 'interview-hono-security-'));
mkdirSync(join(root, 'static', 'admin'), { recursive: true });
writeFileSync(join(root, 'static', 'admin', 'secret.txt'), 'synthetic-protected-marker');
writeFileSync(join(root, 'static', 'public.txt'), 'synthetic-public-marker');
writeFileSync(join(root, 'static', 'hello world.txt'), 'synthetic-space-marker');

async function adapter(mode) {
  if (mode === 'cjs') return { ...sdkRequire('@hono/node-server'), ...sdkRequire('@hono/node-server/serve-static') };
  const load = key => {
    const entry = manifest.exports[key].import;
    return import(pathToFileURL(join(adapterRoot, typeof entry === 'string' ? entry : entry.default)).href);
  };
  return { ...await load('.'), ...await load('./serve-static') };
}
const listen = server => new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => resolve(server.address().port));
});
const close = server => new Promise((resolve, reject) => {
  server.close(error => error ? reject(error) : resolve());
  server.closeAllConnections();
});

test.after(() => rmSync(root, { recursive: true, force: true }));
test('MCP SDK resolves the reviewed official security release', () => {
  assert.equal(manifest.version, '2.1.3');
});
for (const mode of ['cjs', 'esm']) {
  test(`${mode}: static middleware rejects the second-decode authentication bypass and preserves ordinary files`, async () => {
    const { serveStatic, getRequestListener } = await adapter(mode);
    const app = new Hono();
    app.use('/static/admin/*', context => context.text('Unauthorized', 401));
    app.use('/static/*', serveStatic({ root }));
    const server = createServer(getRequestListener(app.fetch, { overrideGlobalObjects: false }));
    const port = await listen(server);
    try {
      for (const path of ['/static/admin/secret.txt', '/static/%61dmin/secret.txt']) {
        const response = await fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(3000) });
        assert.equal(response.status, 401);
      }
      const bypass = await fetch(`http://127.0.0.1:${port}/static/%%36%31dmin/secret.txt`, { signal: AbortSignal.timeout(3000) });
      const bypassBody = await bypass.text();
      assert.notEqual(bypassBody, 'synthetic-protected-marker', 'a malformed path must not disclose the protected fixture');
      assert.equal(bypass.status, 404);
      for (const [path, marker] of [['public.txt', 'synthetic-public-marker'], ['hello%20world.txt', 'synthetic-space-marker']]) {
        const response = await fetch(`http://127.0.0.1:${port}/static/${path}`, { signal: AbortSignal.timeout(3000) });
        assert.equal(response.status, 200);
        assert.equal(await response.text(), marker);
      }
    } finally { await close(server); }
  });
  test(`${mode}: actual MCP SDK adapter initializes and calls a registered tool over loopback HTTP`, async () => {
    const esmPath = relative => pathToFileURL(apiRequire.resolve(`@modelcontextprotocol/sdk/${relative}`).replace('/dist/cjs/', '/dist/esm/')).href;
    const { McpServer } = mode === 'cjs' ? apiRequire('@modelcontextprotocol/sdk/server/mcp.js') : await import(esmPath('server/mcp.js'));
    const { StreamableHTTPServerTransport } = mode === 'cjs' ? apiRequire('@modelcontextprotocol/sdk/server/streamableHttp.js') : await import(esmPath('server/streamableHttp.js'));
    const server = createServer(async (request, response) => {
      // The SDK's stateless transport is single-request: match its actual server example.
      const mcp = new McpServer({ name: 'synthetic-security-fixture', version: '1.0.0' });
      mcp.registerTool('synthetic_echo', { description: 'Offline compatibility fixture' }, async () => ({ content: [{ type: 'text', text: 'synthetic-tool-result' }] }));
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      try {
        await mcp.connect(transport);
        await transport.handleRequest(request, response);
      } catch (error) { console.error('Synthetic SDK request failed:', error); response.writeHead(500); response.end(); }
      finally { await mcp.close(); }
    });
    const port = await listen(server);
    const post = async body => {
      const response = await fetch(`http://127.0.0.1:${port}/mcp`, { method: 'POST', signal: AbortSignal.timeout(3000),
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify(body) });
      assert.equal(response.status, 200);
      return response.json();
    };
    try {
      const initialized = await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'synthetic-client', version: '1.0.0' } } });
      assert.equal(initialized.result.serverInfo.name, 'synthetic-security-fixture');
      const called = await post({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'synthetic_echo', arguments: {} } });
      assert.equal(called.result.content[0].text, 'synthetic-tool-result');
    } finally { await close(server); }
  });
}
