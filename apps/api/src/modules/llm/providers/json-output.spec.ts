import { ConfigService } from '@nestjs/config';
import { QwenProvider } from './qwen.provider';
import { DeepseekProvider } from './deepseek.provider';
import { validateConfiguredVersion } from '../../agent-lab/configured-runtime.contract';
describe('explicit configured JSON output without repair calls', () => {
  it.each([QwenProvider, DeepseekProvider])('forwards opt-in JSON mode through %p and leaves ordinary calls unchanged', async Provider => {
    const provider = new Provider(new ConfigService({ qwen: { apiKey: 'fixture-not-real' }, deepseek: { apiKey: 'fixture-not-real' } }));
    const create = jest.fn().mockResolvedValue({ choices: [{ finish_reason: 'stop', message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 10, completion_tokens: 5 }, model: 'fixture' });
    (provider as any).client = { chat: { completions: { create } } };
    const params = { messages: [{ role: 'user' as const, content: 'Return JSON' }], maxTokens: 100 };
    await provider.chat({ ...params, responseFormat: 'json_object' }); expect(create.mock.calls[0][0].response_format).toEqual({ type: 'json_object' });
    await provider.chat(params); expect(create.mock.calls[1][0]).not.toHaveProperty('response_format'); expect(create).toHaveBeenCalledTimes(2);
  });
  it('rejects unsupported formatting modes and missing JSON instructions at configuration time', () => {
    const version = { systemPrompt: 'Return JSON', modelConfig: { provider: 'qwen', maxTokens: 128, temperature: 0, responseFormat: 'json_object' }, runtimeConfig: { adapter: 'single-agent-v1', maxEstimatedCostCny: .03, maxDurationMs: 15000 } };
    expect(() => validateConfiguredVersion(version)).not.toThrow();
    expect(() => validateConfiguredVersion({ ...version, systemPrompt: 'ordinary prose' })).toThrow();
    expect(() => validateConfiguredVersion({ ...version, modelConfig: { ...version.modelConfig, responseFormat: 'arbitrary' } })).toThrow();
  });
});
