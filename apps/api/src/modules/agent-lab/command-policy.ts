import * as path from 'path';

const DEFAULT_BINARIES = 'node,python3,git,ls,cat,grep,find';
const DANGEROUS_BINARIES = new Set(['rm', 'sudo', 'mkfs', 'shutdown', 'reboot', 'sh', 'bash', 'zsh', 'dash', 'cmd', 'powershell', 'pwsh']);

/** 白名单是命令入口约束，不能隔离解释器内执行的代码或网络行为。 */
export function commandDenial(command: unknown): string | undefined {
  if (typeof command !== 'string' || !command || /[\\/\s\0]/.test(command)) return '命令必须为不含路径分隔符或空白的程序名';
  const binary = path.basename(command);
  if (DANGEROUS_BINARIES.has(binary.toLowerCase())) return `危险命令 "${binary}" 被策略拒绝`;
  const configured = process.env.WORKSPACE_ALLOWED_BINARIES ?? DEFAULT_BINARIES;
  const allowed = new Set(configured.split(',').map(item => item.trim()).filter(item => /^[A-Za-z0-9_.+-]+$/.test(item)));
  if (!allowed.has(binary)) return `命令 "${binary}" 不在允许列表中`;
  return undefined;
}
