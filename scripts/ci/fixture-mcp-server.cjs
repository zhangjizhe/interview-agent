// Local, read-only protocol fixture; no provider, credentials or filesystem tools.
const readline = require('node:readline');
const http = require('node:http');
function reply(message) {
  if (message.id === undefined) return null;
  let result;
  if (message.method === 'initialize') result = { protocolVersion: message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'isolated-fixture', version: '1.0.0' } };
  else if (message.method === 'tools/list') result = { tools: [{ name: 'fixture_echo', description: 'Synthetic echo only', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } }] };
  else if (message.method === 'tools/call' && message.params.name === 'fixture_echo') result = { content: [{ type: 'text', text: message.params.arguments.text }] };
  else return { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Unsupported fixture method' } };
  return { jsonrpc: '2.0', id: message.id, result };
}
if (process.argv.includes('--stdio')) {
  readline.createInterface({ input: process.stdin }).on('line', line => {
    const response = reply(JSON.parse(line));
    if (response) process.stdout.write(JSON.stringify(response) + '\n');
  });
} else {
  http.createServer(async (req, res) => {
    if (req.method !== 'POST') { res.writeHead(405).end(); return; }
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const response = reply(JSON.parse(Buffer.concat(chunks).toString()));
    if (!response) { res.writeHead(202).end(); return; }
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(response));
  }).listen(3336, '127.0.0.1');
}
