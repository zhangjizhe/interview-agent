import { BadRequestException } from '@nestjs/common';

export type RuntimeAdapterContext = {
  userId: string; workspaceId: string; version: any; input: Record<string, any>;
  allowDraft: boolean; bypassSemanticCache: boolean; externalRunId?: string;
};
export interface RuntimeAdapter {
  readonly manifest: { readonly id: string; readonly mode: 'legacy' | 'configured'; readonly capabilities: readonly string[] };
  prepare(context: RuntimeAdapterContext): Promise<unknown>;
  execute(context: RuntimeAdapterContext & { run: any; prepared: any }): Promise<any>;
}

// Construction-time registration only; no user-supplied code or runtime plugin loading.
export class RuntimeAdapterRegistry {
  private readonly entries = new Map<string, RuntimeAdapter>();
  constructor(adapters: readonly RuntimeAdapter[]) {
    for (const adapter of adapters) {
      const { id, mode, capabilities } = adapter.manifest;
      if (!/^[a-z][a-z0-9-]{1,63}$/.test(id) || !['legacy', 'configured'].includes(mode)
        || !Array.isArray(capabilities) || capabilities.some(value => typeof value !== 'string' || !value)
        || typeof adapter.prepare !== 'function' || typeof adapter.execute !== 'function' || this.entries.has(id)) {
        throw new BadRequestException('运行适配器注册无效或重复');
      }
      const manifest = Object.freeze({ id, mode, capabilities: Object.freeze([...capabilities]) });
      this.entries.set(id, Object.freeze({ manifest, prepare: adapter.prepare.bind(adapter), execute: adapter.execute.bind(adapter) }));
    }
  }
  resolve(id: unknown, required: readonly string[] = ['message']) {
    const adapter = typeof id === 'string' ? this.entries.get(id) : undefined;
    if (!adapter) throw new BadRequestException('未知运行适配器；不会自动切换执行引擎');
    if (required.some(capability => !adapter.manifest.capabilities.includes(capability))) {
      throw new BadRequestException('运行适配器不支持所需能力');
    }
    return adapter;
  }
}
