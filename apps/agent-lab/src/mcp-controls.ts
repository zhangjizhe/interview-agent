import { api } from './api';

export async function toggleMcpServer(input: { toolName: string; enabled: boolean }) {
  const submitted = { ...input };
  const result = await api('/admin/mcp-servers/toggle', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(submitted),
  });
  if (result?.ok !== true || result?.toolName !== submitted.toolName || result?.enabled !== submitted.enabled) {
    throw new Error('MCP 开关结果未确认，请重新读取服务状态后核验。');
  }
  return result;
}

export async function readMcpServers() {
  const value = await api('/admin/mcp-servers');
  if (!Array.isArray(value?.servers) || !Number.isInteger(value.count) || value.count !== value.servers.length
    || !Number.isInteger(value.runningCount) || value.runningCount < 0 || value.runningCount > value.count
    || value.servers.some((item: any) => typeof item?.name !== 'string' || !item.name.trim() || typeof item.enabled !== 'boolean' || typeof item.status !== 'string')
    || new Set(value.servers.map((item: any) => item.name)).size !== value.servers.length) {
    throw new Error('工具状态格式异常，请重新读取；未将其显示为空配置。');
  }
  return value;
}
export async function reloadMcpServers() {
  const result = await api('/admin/mcp-servers/reload', { method: 'POST' });
  if (result?.ok !== true || !Array.isArray(result.errors) || result.errors.length) throw new Error('配置重载未确认，请重新读取状态后核对。');
  return result;
}
