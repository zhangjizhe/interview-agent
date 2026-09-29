import { createQuotaFetch } from './quota-fetch';

describe('DeepAgents HTTP 额度边界', () => {
  it('每次物理请求先预留额度并限制输出，保留工具调用协议', async () => {
    const reserveLlm = jest.fn(async p => ({ ...p, maxTokens: 100 }));
    const transport = jest.fn(async () => new Response('{}'));
    const fetcher = createQuotaFetch({ reserveLlm } as any, transport);
    const body = { model: 'fixture', messages: [{ role: 'tool', tool_call_id: 'x', content: 'ok' }], tools: [], max_tokens: 999, stream: true };
    await fetcher('https://example.invalid/chat/completions', { body: JSON.stringify(body) });
    expect(reserveLlm).toHaveBeenCalledTimes(1);
    expect(JSON.parse(transport.mock.calls[0][1].body)).toEqual({ ...body, max_tokens: 100 });
  });
  it('额度拒绝不触发网络', async () => {
    const transport = jest.fn();
    const fetcher = createQuotaFetch({ reserveLlm: jest.fn().mockRejectedValue(new Error('quota')) } as any, transport);
    await expect(fetcher('https://example.invalid/chat/completions', { body: '{"messages":[]}' })).rejects.toThrow('quota');
    expect(transport).not.toHaveBeenCalled();
  });
  it('未知协议 fail closed', async () => {
    const transport = jest.fn();
    const fetcher = createQuotaFetch({} as any, transport);
    await expect(fetcher('https://example.invalid/responses', { body: '{}' })).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });
});
