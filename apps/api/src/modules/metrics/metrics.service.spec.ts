import { EventEmitter } from 'node:events';
import { MetricsService } from './metrics.service';

describe('Prometheus 请求指标', () => {
  it('普通模型请求记录实际次数、耗时和 usage，不包含正文', async () => {
    const metrics = new MetricsService();
    const fetcher = metrics.modelFetch('qwen', async () => new Response(JSON.stringify({ usage: { prompt_tokens: 7, completion_tokens: 3 }, choices: [{ message: { content: 'private' } }] })));
    const response = await fetcher('https://example.invalid', { body: '{"stream":false}' });
    await response.json();
    const text = await metrics.registry.metrics();
    expect(text).toContain('llm_requests_total{provider="qwen",mode="chat",outcome="success"} 1');
    expect(text).toContain('llm_tokens_total{provider="qwen",direction="input"} 7');
    expect(text).not.toContain('private');
  });
  it('分片 SSE 只按一次 usage 计数，并保留响应', async () => {
    const metrics = new MetricsService();
    const source = 'data: {"usage":{"prompt_tokens":5,"completion_tokens":2}}\n\ndata: [DONE]\n\n';
    const body = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(source.slice(0, 15))); c.enqueue(new TextEncoder().encode(source.slice(15))); c.close(); } });
    const response = await metrics.modelFetch('deepseek', async () => new Response(body))('https://example.invalid', { body: '{"stream":true}' });
    expect(await response.text()).toBe(source);
    expect(await metrics.registry.metrics()).toContain('llm_tokens_total{provider="deepseek",direction="output"} 2');
  });
  it('网络错误计入失败', async () => {
    const metrics = new MetricsService();
    await expect(metrics.modelFetch('qwen', async () => { throw new Error('offline'); })('https://example.invalid')).rejects.toThrow();
    expect(await metrics.registry.metrics()).toContain('outcome="error"} 1');
  });
  it('连接 close/finish 不重复扣减，安全计数器增长', async () => {
    const metrics = new MetricsService();
    const response = new EventEmitter();
    metrics.openSse(response as any);
    expect(await metrics.registry.metrics()).toContain('sse_active_connections 1');
    response.emit('close'); response.emit('finish');
    metrics.reject('quota'); metrics.reject('ssrf'); metrics.reject('rate_limit');
    const text = await metrics.registry.metrics();
    expect(text).toContain('sse_active_connections 0');
    for (const kind of ['quota', 'ssrf', 'rate_limit']) expect(text).toContain(`security_rejections_total{kind="${kind}"} 1`);
  });
});
