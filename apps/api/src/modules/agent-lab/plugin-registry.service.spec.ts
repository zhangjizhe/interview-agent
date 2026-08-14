import { PluginRegistryService } from './plugin-registry.service';

function manifest(name = 'demo-plugin') {
  return {
    formatVersion: 1 as const,
    name,
    version: '1.0.0',
    capabilities: ['plan' as const],
    providers: ['tool' as const],
  };
}

describe('PluginRegistryService', () => {
  it('卸载和重载不会遗留已注册 provider', async () => {
    const registry = new PluginRegistryService();
    const first = { name: 'demo-plugin', load: jest.fn(), unload: jest.fn() };
    const second = { name: 'demo-plugin', load: jest.fn(), unload: jest.fn() };

    await registry.register(manifest(), first);
    await registry.reload(manifest(), second);

    expect(first.unload).toHaveBeenCalledTimes(1);
    expect(second.load).toHaveBeenCalledTimes(1);
    expect(registry.list()).toEqual([manifest()]);

    await registry.unregister('demo-plugin');
    expect(second.unload).toHaveBeenCalledTimes(1);
    expect(registry.list()).toEqual([]);
  });
});
