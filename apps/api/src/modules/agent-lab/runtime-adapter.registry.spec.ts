import { RuntimeAdapterRegistry, RuntimeAdapter } from './runtime-adapter.registry';
import { createBuiltinRuntimeAdapters } from './builtin-runtime.adapters';

const context = { userId: 'user', workspaceId: 'workspace', version: { systemPrompt: 'Synthetic prompt' }, input: { message: 'Synthetic input' },
  allowDraft: false, bypassSemanticCache: true, externalRunId: 'session' };
const stub = (id: string): RuntimeAdapter => ({ manifest: { id, mode: 'legacy', capabilities: ['message'] },
  prepare: jest.fn().mockResolvedValue({ ready: true }), execute: jest.fn().mockResolvedValue({ response: id }) });
describe('RuntimeAdapter registration and dispatch contract', () => {
  it('rejects unknown adapters and missing capabilities without invoking callbacks', () => {
    const adapter = stub('synthetic-one'); const registry = new RuntimeAdapterRegistry([adapter]);
    expect(() => registry.resolve('not-registered')).toThrow('未知运行适配器');
    expect(() => registry.resolve('synthetic-one', ['tools'])).toThrow('不支持所需能力');
    expect(adapter.prepare).not.toHaveBeenCalled(); expect(adapter.execute).not.toHaveBeenCalled();
  });
  it('rejects duplicate registration and invalid manifests', () => {
    expect(() => new RuntimeAdapterRegistry([stub('synthetic-one'), stub('synthetic-one')])).toThrow('无效或重复');
    expect(() => new RuntimeAdapterRegistry([stub('bad/key')])).toThrow('无效或重复');
  });
  it('snapshots immutable manifests against later registration object mutation', () => {
    const adapter = stub('synthetic-one'); const registry = new RuntimeAdapterRegistry([adapter]);
    (adapter.manifest.capabilities as string[]).push('tools');
    expect(() => registry.resolve('synthetic-one', ['tools'])).toThrow();
    expect(Object.isFrozen(registry.resolve('synthetic-one').manifest.capabilities)).toBe(true);
  });
  it.each(['synthetic-one', 'synthetic-two'])('selects %s under the same preparation/execution envelope', async id => {
    const adapters = [stub('synthetic-one'), stub('synthetic-two')]; const registry = new RuntimeAdapterRegistry(adapters);
    const selected = registry.resolve(id); const prepared = await selected.prepare(context);
    await expect(selected.execute({ ...context, prepared, run: { id: 'run' } })).resolves.toEqual({ response: id });
    expect(adapters.find(item => item.manifest.id !== id)!.execute).not.toHaveBeenCalled();
  });
  it('wraps the legacy engine with its existing prompt/session/cache inputs', async () => {
    const multi = { isEnabled: jest.fn().mockReturnValue(true), run: jest.fn().mockResolvedValue({ response: 'legacy' }) };
    const adapter = createBuiltinRuntimeAdapters(multi as any).resolve('interview-multi-agent');
    await expect(adapter.prepare(context)).resolves.toBeUndefined();
    await adapter.execute({ ...context, run: { id: 'run' }, prepared: undefined });
    expect(multi.run).toHaveBeenCalledWith('Synthetic input', 'session', [], 'Synthetic prompt', { bypassSemanticCache: true });
    multi.isEnabled.mockReturnValue(false);
    await expect(adapter.execute({ ...context, run: {}, prepared: undefined })).rejects.toThrow('当前未启用');
    expect(multi.run).toHaveBeenCalledTimes(1);
  });
  it.each(['single-agent-v1', 'finite-workflow-v1'])('delegates %s validation and execution to the existing configured runtime', async id => {
    const prepared = { definition: { adapter: id }, versions: new Map() };
    const configured = { prepare: jest.fn().mockResolvedValue(prepared), execute: jest.fn().mockResolvedValue({ output: { response: 'configured' } }) };
    const adapter = createBuiltinRuntimeAdapters({} as any, configured as any).resolve(id);
    const result = await adapter.prepare(context); const run = { id: 'run' };
    await adapter.execute({ ...context, prepared: result, run });
    expect(configured.prepare).toHaveBeenCalledWith(context.version, 'workspace', false);
    expect(configured.execute).toHaveBeenCalledWith('user', run, context.version, context.input, prepared);
  });
  it('rejects a missing configured implementation before execution', async () => {
    const adapter = createBuiltinRuntimeAdapters({} as any).resolve('single-agent-v1');
    await expect(adapter.prepare(context)).rejects.toThrow('配置运行时不可用');
  });
});
