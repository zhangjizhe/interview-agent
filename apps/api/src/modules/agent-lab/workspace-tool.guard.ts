import { commandDenial } from './command-policy';
import * as path from 'path';
import { ToolCall, ToolGuard, ToolPolicyError } from './tool-runner.service';


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
    if (args.command !== undefined) {
      const command = Array.isArray(args.command) ? args.command[0] : args.command;
      const denied = commandDenial(command);
      if (denied) throw new ToolPolicyError(denied);
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
