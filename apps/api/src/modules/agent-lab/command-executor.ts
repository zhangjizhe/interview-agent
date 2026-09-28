import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { ToolDefinition } from './tool-runner.service';

export type ExecutionCapability = 'plan' | 'workspace-write';
export type NetworkPolicy = 'DENY' | 'ALLOW';

export type CommandRequest = {
  command: string;
  args?: string[];
  cwd?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  network?: NetworkPolicy;
  env?: Record<string, string>;
  signal?: AbortSignal;
};

export type CommandResult = {
  status: 'COMPLETED' | 'TIMED_OUT' | 'CANCELLED' | 'OUTPUT_LIMIT' | 'FAILED' | 'DENIED';
  exitCode: number | null;
  stdout: string;
  stderr: string;
  error?: string;
};

export interface CommandExecutor {
  execute(request: CommandRequest): Promise<CommandResult>;
}

export interface WorkspaceProvider {
  readonly capability: ExecutionCapability;
  readFile(relativePath: string): Promise<string>;
  writeFile(relativePath: string, content: string): Promise<void>;
}

export class LocalWorkspaceProvider implements WorkspaceProvider {
  readonly capability: ExecutionCapability;

  constructor(
    private readonly root: string,
    capability: ExecutionCapability = 'workspace-write',
  ) {
    this.capability = capability;
  }

  async readFile(relativePath: string) {
    return fs.readFile(await this.resolveSafePath(relativePath, false), 'utf8');
  }

  async writeFile(relativePath: string, content: string) {
    if (this.capability !== 'workspace-write') {
      throw new Error('当前能力预设为只读 plan，禁止工作区写入');
    }
    const target = await this.resolveSafePath(relativePath, true);
    await fs.writeFile(target, content, 'utf8');
  }

  private async resolveSafePath(relativePath: string, forWrite: boolean) {
    if (!relativePath || path.isAbsolute(relativePath)) {
      throw new Error('只允许工作区内相对路径');
    }
    const root = await fs.realpath(this.root);
    const target = path.resolve(root, relativePath);
    this.assertInside(root, target);

    const verificationTarget = forWrite ? path.dirname(target) : target;
    let realTarget: string;
    try {
      realTarget = await fs.realpath(verificationTarget);
    } catch {
      throw new Error('目标路径或其父目录不存在');
    }
    this.assertInside(root, realTarget);
    if (forWrite) {
      try {
        this.assertInside(root, await fs.realpath(target));
      } catch (error: any) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
    return target;
  }

  private assertInside(root: string, target: string) {
    if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
      throw new Error('路径越过工作区边界或符号链接边界');
    }
  }
}

/**
 * 本地执行器没有 OS 级 sandbox。它仅以最小环境、受控 cwd、超时和输出上限降低风险。
 * 生产环境应替换为容器或远程 worker 实现。
 */
export class LocalCommandExecutor implements CommandExecutor {
  constructor(
    private readonly workspaceRoot: string,
    private readonly capability: ExecutionCapability = 'workspace-write',
  ) {}

  async execute(request: CommandRequest): Promise<CommandResult> {
    if (this.capability !== 'workspace-write') {
      return this.denied('当前能力预设为 plan，禁止执行命令');
    }
    if (request.network === 'ALLOW') {
      return this.denied('本地执行器不提供可验证的网络放行能力');
    }

    const workspace = await fs.realpath(this.workspaceRoot);
    const cwd = request.cwd
      ? await this.resolveWorkspaceDirectory(workspace, request.cwd)
      : workspace;
    const timeoutMs = request.timeoutMs ?? 30_000;
    const maxOutputBytes = request.maxOutputBytes ?? 256 * 1024;
    const tempDir = path.join(workspace, '.agent-lab-tmp');
    await fs.mkdir(tempDir, { recursive: true, mode: 0o700 });
    const environment = this.sanitizedEnvironment(request.env, tempDir);

    return new Promise<CommandResult>((resolve) => {
      let stdout = '';
      let stderr = '';
      let bytes = 0;
      let settled = false;
      let forcedResult: CommandResult | undefined;
      let timeout: NodeJS.Timeout | undefined;
      let cancellationListener: (() => void) | undefined;
      const child = spawn(request.command, request.args || [], {
        cwd,
        env: environment,
        detached: process.platform !== 'win32',
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const finish = (result: CommandResult) => {
        if (settled) return;
        settled = true;
        if (timeout) clearTimeout(timeout);
        if (cancellationListener) request.signal?.removeEventListener('abort', cancellationListener);
        resolve(result);
      };
      const terminateGroup = () => {
        if (!child.pid) return;
        if (process.platform !== 'win32') {
          try {
            process.kill(-child.pid, 'SIGTERM');
          } catch {}
          setTimeout(() => {
            try {
              process.kill(-child.pid!, 'SIGKILL');
            } catch {}
          }, 500).unref();
          return;
        }
        child.kill('SIGTERM');
      };
      const stopAndWait = (result: CommandResult) => {
        if (settled || forcedResult) return;
        forcedResult = result;
        terminateGroup();
      };
      const append = (stream: 'stdout' | 'stderr', chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > maxOutputBytes) {
          stopAndWait({
            status: 'OUTPUT_LIMIT',
            exitCode: null,
            stdout,
            stderr,
            error: `输出超过 ${maxOutputBytes} 字节上限`,
          });
          return;
        }
        if (stream === 'stdout') stdout += chunk.toString('utf8');
        else stderr += chunk.toString('utf8');
      };

      child.stdout.on('data', (chunk: Buffer) => append('stdout', chunk));
      child.stderr.on('data', (chunk: Buffer) => append('stderr', chunk));
      child.on('error', (error) => finish({
        status: 'FAILED',
        exitCode: null,
        stdout,
        stderr,
        error: error.message,
      }));
      child.on('close', (exitCode) => {
        if (forcedResult) {
          finish(forcedResult);
          return;
        }
        finish({
          status: exitCode === 0 ? 'COMPLETED' : 'FAILED',
          exitCode,
          stdout,
          stderr,
          ...(exitCode === 0 ? {} : { error: `命令以退出码 ${exitCode} 结束` }),
        });
      });

      timeout = setTimeout(() => {
        stopAndWait({
          status: 'TIMED_OUT',
          exitCode: null,
          stdout,
          stderr,
          error: `命令超过 ${timeoutMs}ms`,
        });
      }, timeoutMs);
      cancellationListener = () => {
        stopAndWait({
          status: 'CANCELLED',
          exitCode: null,
          stdout,
          stderr,
          error: '命令已取消',
        });
      };
      if (request.signal?.aborted) cancellationListener();
      else request.signal?.addEventListener('abort', cancellationListener, { once: true });
    });
  }

  private async resolveWorkspaceDirectory(root: string, requested: string) {
    if (path.isAbsolute(requested)) throw new Error('cwd 只能是工作区内相对路径');
    const resolved = path.resolve(root, requested);
    const real = await fs.realpath(resolved);
    if (real !== root && !real.startsWith(`${root}${path.sep}`)) {
      throw new Error('cwd 超出工作区边界');
    }
    return real;
  }

  private sanitizedEnvironment(requestEnv: Record<string, string> | undefined, tempDir: string) {
    const allowedBase = ['PATH', 'LANG', 'LC_ALL'];
    const env: Record<string, string> = {};
    for (const key of allowedBase) {
      if (process.env[key]) env[key] = process.env[key]!;
    }
    env.TMPDIR = tempDir;
    for (const [key, value] of Object.entries(requestEnv || {})) {
      if (/key|token|secret|password/i.test(key)) continue;
      env[key] = value;
    }
    return env;
  }

  private denied(error: string): CommandResult {
    return { status: 'DENIED', exitCode: null, stdout: '', stderr: '', error };
  }
}

/**
 * 通过 ToolRunner 使用本地命令执行器的最小 provider。
 * 它本身不负责审批、guard 或 Trace，这些全部由 ToolRunner 统一处理。
 */
export class WorkspaceCommandToolProvider implements ToolDefinition {
  readonly name = 'workspace.command';
  readonly requiresApproval = true;

  constructor(private readonly executor: CommandExecutor) {}

  async execute(args: Record<string, unknown>): Promise<CommandResult> {
    if (typeof args.command !== 'string' || args.command.length === 0) {
      throw new Error('workspace.command 要求 command 字符串');
    }
    if (args.args !== undefined && !Array.isArray(args.args)) {
      throw new Error('workspace.command 的 args 必须是字符串数组');
    }
    return this.executor.execute({
      command: args.command,
      args: Array.isArray(args.args)
        ? args.args.filter((item): item is string => typeof item === 'string')
        : [],
      cwd: typeof args.cwd === 'string' ? args.cwd : undefined,
      timeoutMs: typeof args.timeoutMs === 'number' ? args.timeoutMs : undefined,
      network: 'DENY',
    });
  }
}
