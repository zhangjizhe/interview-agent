import { JsonLogger } from './json-logger';

describe('JSON logger', () => {
  it('保持 Logger 接口并输出可解析、脱敏的单行 JSON', () => {
    const lines: string[] = [];
    const logger = new JsonLogger(line => lines.push(line));
    logger.log({ event: 'test', password: 'private', accessToken: 'secret', content: 'candidate answer' }, 'Fixture');
    logger.error('Bearer hidden password=private person@example.invalid', 'stack\nnext', 'Fixture');
    const records = lines.map(line => JSON.parse(line));
    expect(records[0]).toMatchObject({ level: 'info', context: 'Fixture', message: { event: 'test', password: '[REDACTED]', content: '[REDACTED]' } });
    expect(lines.join('')).not.toMatch(/private|candidate answer|person@example.invalid|Bearer hidden/);
    expect(records[1].level).toBe('error');
  });
});
