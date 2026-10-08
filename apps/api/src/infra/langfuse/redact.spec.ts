jest.mock('langfuse', () => ({ Langfuse: jest.fn() }));
import { ConfigService } from '@nestjs/config';
import { LangfuseService } from './langfuse.service';
import { redactTelemetry } from './redact';

describe('telemetry redaction', () => {
  it('redacts nested credentials and PII without mutating input or token counts', () => {
    const source = { apiKey: 'private', nested: [{ 'X-API-Key': 'private', access_token: 'private', email: 'person@example.com' }], promptTokens: 42 };
    const result = redactTelemetry(source);
    expect(result).toEqual({ apiKey: '[REDACTED]', nested: [{ 'X-API-Key': '[REDACTED]', access_token: '[REDACTED]', email: '[REDACTED]' }], promptTokens: 42 });
    expect(source.apiKey).toBe('private');
  });
  it('scrubs credentials and common contact details in free text', () => {
    expect(redactTelemetry('Bearer abc.def sk-example123 person@example.com 13900000000'))
      .toBe('Bearer [REDACTED] [REDACTED] [REDACTED_EMAIL] [REDACTED_PHONE]');
  });
  it('handles cycles and preserves repeated noncyclic objects', () => {
    const shared = { count: 1 };
    const cycle: any = { shared, other: shared }; cycle.self = cycle;
    expect(redactTelemetry(cycle)).toEqual({ shared: { count: 1 }, other: { count: 1 }, self: '[CIRCULAR]' });
  });
  it('scrubs every SDK submission and streamed output update', () => {
    const service = new LangfuseService({ get: () => 1 } as unknown as ConfigService);
    const generation = { update: jest.fn() };
    const client = { trace: jest.fn(), generation: jest.fn(() => generation), span: jest.fn() };
    (service as any).client = client;
    const params = { traceId: 'trace', name: 'test', model: 'qwen', metadata: { apiKey: 'private' }, input: { password: 'private' }, output: { email: 'person@example.com' } };
    service.startTrace(params);
    service.createGeneration(params);
    service.logGeneration(params);
    service.logSpan(params);
    service.logToolCall({ ...params, error: 'Bearer private' });
    service.updateGenerationOutput(generation, params.output);
    for (const method of [client.trace, client.generation, client.span, generation.update]) {
      expect(method).toHaveBeenCalled();
      const serialized = JSON.stringify(method.mock.calls);
      expect(serialized).not.toContain('private');
      expect(serialized).not.toContain('person@example.com');
    }
  });
});
