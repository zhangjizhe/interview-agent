import { BadRequestException, ConflictException } from '@nestjs/common';
import type { MultiAgentService } from '../agent/multi-agent.service';
import type { ConfiguredRuntimeService } from './configured-runtime.service';

export const RUNTIME_ADAPTER_REGISTRY = Symbol('RUNTIME_ADAPTER_REGISTRY');

export type RuntimeAdapterManifest = Readonly<{
  id: string;
  contractVersion: 'runtime-adapter/v1';
  capabilities: Readonly<{ requiresQueue: boolean; cancellation: 'none' | 'node-boundary' }>;
}>;

export type RuntimePreparation = {
  version: any;
  workspaceId: string;
  allowDraft: boolean;
};
export type RuntimeExecution = {
  userId: string;
  run: any;
  version: any;
  input: Record<string, any>;
  externalRunId?: string;
  bypassSemanticCache: boolean;
};

/** Adapters own execution only. Authorization, Run transitions and Trace remain in the runtime service. */
export interface RuntimeAdapter {
  readonly manifest: RuntimeAdapterManifest;
  prepare(context: RuntimePreparation): Promise<unknown>;
  execute(context: RuntimeExecution, prepared: unknown): Promise<any>;
}

export class RuntimeAdapterRegistry {
  private readonly adapters = new Map<string, RuntimeAdapter>();

  constructor(adapters: RuntimeAdapter[]) {
    for (const adapter of adapters) {
      const { id, contractVersion, capabilities } = adapter.manifest;
      if (!id || contractVersion !== 'runtime-adapter/v1' || typeof capabilities?.requiresQueue !== 'boolean'
        || !['none', 'node-boundary'].includes(capabilities.cancellation)
        || typeof adapter.prepare !== 'function' || typeof adapter.execute !== 'function') {
        throw new BadRequestException('运行适配器合同无效');
      }
      if (this.adapters.has(id)) throw new ConflictException(`重复运行适配器: ${id}`);
      this.adapters.set(id, adapter);
    }
  }

  resolve(id: unknown): RuntimeAdapter {
    const adapter = typeof id === 'string' ? this.adapters.get(id) : undefined;
    if (!adapter) throw new BadRequestException(`不支持的运行适配器: ${String(id)}`);
    return adapter;
  }
}

export function createBuiltinRuntimeAdapters(multiAgent: MultiAgentService, configured?: ConfiguredRuntimeService) {
  const interview: RuntimeAdapter = {
    manifest: Object.freeze({ id: 'interview-multi-agent', contractVersion: 'runtime-adapter/v1',
      capabilities: Object.freeze({ requiresQueue: false, cancellation: 'none' }) }),
    async prepare() { return undefined; },
    async execute(context) {
      if (!multiAgent.isEnabled()) throw new ConflictException('interview-multi-agent 运行时当前未启用');
      return multiAgent.run(context.input.message, context.externalRunId || context.run.id, [], context.version.systemPrompt,
        { bypassSemanticCache: context.bypassSemanticCache });
    },
  };
  const configuredAdapters: RuntimeAdapter[] = ['single-agent-v1', 'finite-workflow-v1'].map(id => ({
    manifest: Object.freeze({ id, contractVersion: 'runtime-adapter/v1' as const,
      capabilities: Object.freeze({ requiresQueue: true, cancellation: 'node-boundary' as const }) }),
    async prepare(context) {
      if (!configured) throw new ConflictException('配置运行时不可用');
      return configured.prepare(context.version, context.workspaceId, context.allowDraft);
    },
    async execute(context, prepared) {
      if (!configured) throw new ConflictException('配置运行时不可用');
      return configured.execute(context.userId, context.run, context.version, context.input,
        prepared as Awaited<ReturnType<ConfiguredRuntimeService['prepare']>>);
    },
  }));
  return new RuntimeAdapterRegistry([interview, ...configuredAdapters]);
}
