import http from 'node:http';
const stats = { chat: 0, embedding: 0, rerank: 0, externalRequests: 0 };
http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/fixture/stats') return res.end(JSON.stringify(stats));
  const chunks = []; for await (const chunk of req) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
  if (req.url === '/v1/chat/completions') {
    stats.chat++;
    const prompt = body.messages?.[0]?.content ?? '';
    const message = body.messages?.at(-1)?.content ?? '';
    if (message.includes('fixture-delay')) await new Promise(resolve => setTimeout(resolve, 3000));
    const content = prompt.includes('fixture-route') ? 'route-yes' : `fixture-response:${message}`;
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
}).listen(3335, '127.0.0.1');
