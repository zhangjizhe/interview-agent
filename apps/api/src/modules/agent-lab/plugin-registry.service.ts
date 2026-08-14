import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ToolDefinition } from './tool-runner.service';

export type CapabilityPreset = 'plan' | 'workspace-write';

export type AgentLabPluginManifest = {
  formatVersion: 1;
  name: string;
  version: string;
  capabilities: CapabilityPreset[];
  providers: Array<'tool' | 'mcp' | 'skill'>;
};

export interface CapabilityProvider {
  readonly name: string;
  load(): Promise<void>;
  unload(): Promise<void>;
}

export interface McpClientCapability {
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
}

export class McpToolCapabilityProvider implements CapabilityProvider {
  readonly name: string;

  constructor(
    private readonly manifest: AgentLabPluginManifest,
    private readonly client: McpClientCapability,
  ) {
    this.name = manifest.name;
  }

  async load() {}

  async unload() {}

  asTool(toolName: string, requiresApproval = true): ToolDefinition {
    return {
      name: `mcp.${this.name}.${toolName}`,
      requiresApproval,
      execute: (args) => this.client.callTool(toolName, args),
    };
  }
}

@Injectable()
export class PluginRegistryService {
  private readonly plugins = new Map<string, { manifest: AgentLabPluginManifest; provider: CapabilityProvider }>();

  async register(manifest: AgentLabPluginManifest, provider: CapabilityProvider) {
    this.validate(manifest, provider);
    if (this.plugins.has(manifest.name)) {
      throw new ConflictException(`插件 ${manifest.name} 已注册`);
    }
    await provider.load();
    this.plugins.set(manifest.name, { manifest, provider });
    return manifest;
  }

  async unregister(name: string) {
    const plugin = this.plugins.get(name);
    if (!plugin) throw new NotFoundException(`插件 ${name} 不存在`);
    await plugin.provider.unload();
    this.plugins.delete(name);
    return { unregistered: name };
  }

  async reload(manifest: AgentLabPluginManifest, provider: CapabilityProvider) {
    if (this.plugins.has(manifest.name)) await this.unregister(manifest.name);
    return this.register(manifest, provider);
  }

  list() {
    return [...this.plugins.values()].map(({ manifest }) => manifest);
  }

  private validate(manifest: AgentLabPluginManifest, provider: CapabilityProvider) {
    if (manifest.formatVersion !== 1) throw new ConflictException('不支持的插件 manifest 版本');
    if (!/^[a-z][a-z0-9-]{1,63}$/.test(manifest.name)) {
      throw new ConflictException('插件名必须是 2-64 位小写字母、数字或连字符');
    }
    if (provider.name !== manifest.name) throw new ConflictException('插件 provider 名称不匹配');
  }
}
