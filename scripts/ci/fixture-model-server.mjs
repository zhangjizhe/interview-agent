import http from 'node:http';
import { goldenModelReply } from './golden-model-contract.mjs';
let goldenProfile = null;
const stats = { chat: 0, embedding: 0, rerank: 0, externalRequests: 0 };
let releaseHeldCall;
const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/fixture/stats') return res.end(JSON.stringify(stats));
  if (req.url === '/fixture/hold-state') return res.end(JSON.stringify({ waiting: Boolean(releaseHeldCall) }));
  if (req.url === '/fixture/release' && req.method === 'POST') {
    releaseHeldCall?.(); return res.end(JSON.stringify({ released: true }));
  }
  const chunks = []; for await (const chunk of req) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
  if (req.url === '/fixture/golden-profile' && req.method === 'POST') {
    if (![null, 'baseline', 'retest'].includes(body.stage)) { res.statusCode = 400; return res.end(JSON.stringify({ error: 'Invalid synthetic profile' })); }
    goldenProfile = body.stage; return res.end(JSON.stringify({ stage: goldenProfile }));
  }
  if (req.url === '/v1/chat/completions') {
    stats.chat++;
    const prompt = body.messages?.[0]?.content ?? '';
    const message = body.messages?.at(-1)?.content ?? '';
    if (message === 'fixture-hold-cancel') await new Promise(resolve => {
      const timer = setTimeout(() => releaseHeldCall?.(), 60000);
      releaseHeldCall = () => { clearTimeout(timer); releaseHeldCall = undefined; resolve(); };
    });
    if (message.includes('fixture-delay')) await new Promise(resolve => setTimeout(resolve, 3000));
    let content;
    try { content = goldenProfile ? goldenModelReply(body, { stage: goldenProfile }) : prompt.includes('fixture-route') ? 'route-yes' : `fixture-response:${message}`; }
    catch { res.statusCode = 422; return res.end(JSON.stringify({ error: { message: 'Unsupported synthetic golden contract' } })); }
    if (body.stream === true) {
      res.setHeader('Content-Type', 'text/event-stream');
      const chunks = [content.slice(0, Math.ceil(content.length / 2)), content.slice(Math.ceil(content.length / 2))];
      for (const part of chunks) {
        res.write(`data: ${JSON.stringify({ id: 'synthetic', object: 'chat.completion.chunk', created: 1, model: body.model, choices: [{ index: 0, delta: { content: part }, finish_reason: null }] })}\n\n`);
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      res.write(`data: ${JSON.stringify({ id: 'synthetic', object: 'chat.completion.chunk', created: 1, model: body.model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } })}\n\n`);
      return res.end('data: [DONE]\n\n');
    }
    return res.end(JSON.stringify({ id: 'synthetic', object: 'chat.completion', created: 1, model: body.model,
      choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }));
  }
  if (req.url === '/v1/embeddings') {
    stats.embedding++;
    const inputs = Array.isArray(body.input) ? body.input : [body.input];
    return res.end(JSON.stringify({ object: 'list', model: body.model, data: inputs.map((_, index) => ({ object: 'embedding', index, embedding: Array.from({ length: 1024 }, (_, i) => i === 0 ? 1 : 0) })), usage: { prompt_tokens: inputs.length * 10, total_tokens: inputs.length * 10 } }));
  }
  if (req.url === '/fixture/rerank') {
    stats.rerank++;
    return res.end(JSON.stringify({ output: { results: body.input.documents.map((_, index) => ({ index, relevance_score: 1 - index / 100 })) }, usage: { total_tokens: 20 } }));
  }
  res.statusCode = 404; res.end(JSON.stringify({ error: { message: 'Unsupported fixture endpoint' } }));
});
server.listen(Number(process.env.FIXTURE_MODEL_PORT || 3335), '127.0.0.1', () => console.log(`synthetic-fixture-port:${server.address().port}`));
