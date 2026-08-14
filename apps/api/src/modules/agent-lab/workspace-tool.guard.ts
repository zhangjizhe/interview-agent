import * as path from 'path';
import { ToolCall, ToolGuard, ToolPolicyError } from './tool-runner.service';

const DANGEROUS_COMMANDS = new Set(['rm', 'sudo', 'mkfs', 'shutdown', 'reboot']);

/**
 * 这是 ToolRunner 的纵深防御策略，不是 OS 级沙箱。
 * 它只拒绝，绝不修改工具名、参数或目标。
 */
export class WorkspaceToolGuard implements ToolGuard {
  constructor(private readonly workspaceRoot: string) {}

  check(call: ToolCall) {
    const args = call.args;
    if (typeof args.path === 'string') {
      this.assertInsideWorkspace(args.path);
    }
    if (typeof args.command === 'string') {
      const command = args.command.trim().split(/\s+/)[0];
      if (DANGEROUS_COMMANDS.has(command)) {
        throw new ToolPolicyError(`危险命令 "${command}" 被策略拒绝`);
      }
    }
    if (Array.isArray(args.command)) {
      const command = args.command[0];
      if (typeof command === 'string' && DANGEROUS_COMMANDS.has(command)) {
        throw new ToolPolicyError(`危险命令 "${command}" 被策略拒绝`);
      }
    }
  }

  private assertInsideWorkspace(targetPath: string) {
    if (path.isAbsolute(targetPath)) {
      throw new ToolPolicyError('工作区工具只接受相对路径');
    }
    const root = path.resolve(this.workspaceRoot);
    const resolved = path.resolve(root, targetPath);
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
      throw new ToolPolicyError('目标路径超出工作区边界');
    }
  }
}
