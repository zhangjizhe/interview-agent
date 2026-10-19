import { ConflictException } from '@nestjs/common';
import type { MultiAgentService } from '../agent/multi-agent.service';
import type { ConfiguredRuntimeService } from './configured-runtime.service';
import { RuntimeAdapterRegistry, RuntimeAdapterContext } from './runtime-adapter.registry';

export function createBuiltinRuntimeAdapters(multiAgent: MultiAgentService, configured?: ConfiguredRuntimeService) {
  return new RuntimeAdapterRegistry([
    {
      manifest: { id: 'interview-multi-agent', mode: 'legacy', capabilities: ['message'] },
      prepare: async () => undefined,
      execute: async context => {
        if (!multiAgent.isEnabled()) throw new ConflictException('interview-multi-agent 运行时当前未启用');
        return multiAgent.run(context.input.message, context.externalRunId || context.run.id, [], context.version.systemPrompt,
          { bypassSemanticCache: context.bypassSemanticCache });
      },
    },
    ...['single-agent-v1', 'finite-workflow-v1'].map(id => ({
      manifest: { id, mode: 'configured' as const, capabilities: ['message'] },
      prepare: async (context: RuntimeAdapterContext) => {
        if (!configured) throw new ConflictException('配置运行时不可用');
        return configured.prepare(context.version, context.workspaceId, context.allowDraft);
      },
      execute: async (context: RuntimeAdapterContext & { run: any; prepared: any }) => {
        if (!configured) throw new ConflictException('配置运行时不可用');
        return configured.execute(context.userId, context.run, context.version, context.input, context.prepared);
      },
    })),
  ]);
}
