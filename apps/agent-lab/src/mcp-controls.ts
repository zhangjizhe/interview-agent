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
