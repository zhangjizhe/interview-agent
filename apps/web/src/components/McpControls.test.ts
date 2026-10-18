import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toggleMcpServer } from '../../../agent-lab/src/mcp-controls';
const { transport } = vi.hoisted(() => ({ transport: vi.fn() }));
vi.mock('../../../agent-lab/src/api', () => ({ api: transport }));
beforeEach(() => { transport.mockReset(); });
describe('MCP runtime toggle receipt contract', () => {
  it.each([null, {}, { ok: false, toolName: 'builtin-one', enabled: false }, { ok: true, toolName: 'other', enabled: false }, { ok: true, toolName: 'builtin-one', enabled: true }, { ok: true, toolName: 'builtin-one', enabled: 'false' }])('rejects an unconfirmed acknowledgement %j without replay', async receipt => {
    transport.mockResolvedValue(receipt);
    await expect(toggleMcpServer({ toolName: 'builtin-one', enabled: false })).rejects.toThrow('MCP 开关结果未确认，请重新读取服务状态后核验。');
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it.each([false, true])('accepts an exact %s acknowledgement', async enabled => {
    const receipt = { ok: true, toolName: 'builtin-one', enabled };
    transport.mockResolvedValue(receipt);
    await expect(toggleMcpServer({ toolName: 'builtin-one', enabled })).resolves.toEqual(receipt);
    expect(JSON.parse(transport.mock.calls[0][1].body)).toEqual({ toolName: 'builtin-one', enabled });
  });
  it('preserves a rejected transport without replay', async () => {
    transport.mockRejectedValue(new Error('Synthetic unavailable'));
    await expect(toggleMcpServer({ toolName: 'builtin-one', enabled: false })).rejects.toThrow('Synthetic unavailable');
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
