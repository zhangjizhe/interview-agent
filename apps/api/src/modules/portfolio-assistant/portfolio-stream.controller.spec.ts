import { EventEmitter } from 'node:events';
import { PortfolioAssistantController } from './portfolio-assistant.controller';
jest.mock('./portfolio-assistant.service', () => ({ PortfolioAssistantService: class {} }));
const facts = { answer: '公开资料原文', sources: [{ title: '公开项目', href: '#projects' }] };
function harness(stream = true) {
  const frames: Array<{ event: string; data: any }> = [];
  const response: any = new EventEmitter();
  response.status = jest.fn(() => response); response.setHeader = jest.fn(); response.set = jest.fn(() => response);
  response.flushHeaders = jest.fn(); response.json = jest.fn(); response.end = jest.fn();
  response.write = jest.fn((frame: string) => { const lines = frame.split('\n'); frames.push({ event: lines[0].slice(7), data: JSON.parse(lines[1].slice(6)) }); return true; });
  const assistant: any = { submit: jest.fn(async () => ({ status: 'PENDING', ticket: 'synthetic-signed-capability' })),
    answer: jest.fn().mockResolvedValueOnce({ status: 'RUNNING' }).mockResolvedValue({ status: 'COMPLETED', ...facts, answer: facts.answer + '\n技术解读' }),
    streamSnapshot: jest.fn(async () => facts) };
  const request: any = { get: (key: string) => key === 'accept' ? (stream ? 'text/event-stream' : 'application/json') : 'https://portfolio.example', accepts: () => stream, ip: 'synthetic-ip' };
  return { frames, response, assistant, request, controller: new PortfolioAssistantController(assistant) };
}
describe('public SSE delivery lifecycle', () => {
  it('delivers validated facts before completion and appends only new text with no private identifiers', async () => {
    const h = harness();
    await h.controller.chat({}, h.request, h.response);
    expect(h.frames.filter(f => f.event === 'delta').map(f => f.data.text)).toEqual([facts.answer, '\n技术解读']);
    expect(h.frames.at(-1)).toEqual({ event: 'done', data: { status: 'COMPLETED' } });
    expect(JSON.stringify(h.frames)).not.toContain('synthetic-signed-capability');
    expect(h.assistant.submit).toHaveBeenCalledTimes(1); expect(h.response.end).toHaveBeenCalled();
  });
  it('preserves the polling JSON contract and refuses out-of-scope questions without opening SSE', async () => {
    const json = harness(false); await json.controller.chat({}, json.request, json.response);
    expect(json.response.status).toHaveBeenCalledWith(202); expect(json.assistant.answer).not.toHaveBeenCalled();
    const refused = harness(); refused.assistant.submit.mockResolvedValue({ status: 'REFUSED', answer: '只回答公开资料', sources: [] });
    await refused.controller.chat({}, refused.request, refused.response);
    expect(refused.response.status).toHaveBeenCalledWith(200); expect(refused.response.flushHeaders).not.toHaveBeenCalled();
    const greeting = harness(); greeting.assistant.submit.mockResolvedValue({ status: 'COMPLETED', ...facts });
    await greeting.controller.chat({}, greeting.request, greeting.response);
    expect(greeting.response.status).toHaveBeenCalledWith(200); expect(greeting.assistant.answer).not.toHaveBeenCalled();
  });
  it('closes a disconnected viewer without resubmitting or cancelling its already admitted Run', async () => {
    const h = harness(); h.response.write.mockImplementation((frame: string) => { if (frame.startsWith('event: delta')) h.response.emit('close'); return true; });
    await h.controller.chat({}, h.request, h.response);
    expect(h.assistant.submit).toHaveBeenCalledTimes(1); expect(h.assistant.answer).toHaveBeenCalledTimes(1);
    expect(h.response.listenerCount('close')).toBe(0);
  });
  it('never sends done after a failed Run or a changed final projection', async () => {
    for (const final of [{ status: 'FAILED' }, { status: 'COMPLETED', ...facts, answer: 'changed' }]) {
      const h = harness(); h.assistant.answer.mockReset().mockResolvedValueOnce({ status: 'RUNNING' }).mockResolvedValue(final);
      await h.controller.chat({}, h.request, h.response);
      expect(h.frames.some(f => f.event === 'done')).toBe(false);
      expect(h.frames.at(-1)).toEqual({ event: 'error', data: { terminal: true } });
    }
  });
  it('deduplicates repeated RUNNING status frames across consecutive poll ticks', async () => {
    const h = harness();
    h.assistant.answer.mockReset()
      .mockResolvedValueOnce({ status: 'RUNNING' })
      .mockResolvedValueOnce({ status: 'RUNNING' })
      .mockResolvedValue({ status: 'COMPLETED', ...facts });
    await h.controller.chat({}, h.request, h.response);
    expect(h.frames.filter(f => f.event === 'status')).toEqual([{ event: 'status', data: { status: 'RUNNING' } }]);
    expect(h.frames.at(-1)).toEqual({ event: 'done', data: { status: 'COMPLETED' } });
  });
});
