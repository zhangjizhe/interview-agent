import { LocalCommandExecutor } from './command-executor';
import { WorkspaceToolGuard } from './workspace-tool.guard';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

describe('命令白名单', () => {
  let root: string;
  const original = process.env.WORKSPACE_ALLOWED_BINARIES;
  beforeEach(async () => { delete process.env.WORKSPACE_ALLOWED_BINARIES; root = await fs.mkdtemp(path.join(os.tmpdir(), 'command-policy-')); });
  afterEach(async () => { if (original === undefined) delete process.env.WORKSPACE_ALLOWED_BINARIES; else process.env.WORKSPACE_ALLOWED_BINARIES = original; await fs.rm(root, { recursive: true, force: true }); });
  it.each(['/bin/rm', 'sh', 'bash', '../node', 'C:\\bin\\node', 'curl', 'node -e'])('执行器拒绝 %s', async command => {
    await expect(new LocalCommandExecutor(root).execute({ command, args: [] })).resolves.toMatchObject({ status: 'DENIED' });
  });
  it.each(['/bin/rm', 'sh', 'curl'])('Guard 拒绝 %s', command => {
    expect(() => new WorkspaceToolGuard(root).check({ args: { command, args: ['-c', 'echo no'] } } as any)).toThrow();
  });
  it('白名单内正常执行', async () => {
    await expect(new LocalCommandExecutor(root).execute({ command: 'node', args: ['-e', "process.stdout.write('ok')"] })).resolves.toMatchObject({ status: 'COMPLETED', stdout: 'ok' });
  });
  it('可通过环境缩小白名单', async () => {
    process.env.WORKSPACE_ALLOWED_BINARIES = 'ls';
    await expect(new LocalCommandExecutor(root).execute({ command: 'node' })).resolves.toMatchObject({ status: 'DENIED' });
  });
  it('显式空白名单默认拒绝', async () => {
    process.env.WORKSPACE_ALLOWED_BINARIES = '';
    await expect(new LocalCommandExecutor(root).execute({ command: 'node' })).resolves.toMatchObject({ status: 'DENIED' });
  });
  it('配置不能覆盖危险命令兜底', async () => {
    process.env.WORKSPACE_ALLOWED_BINARIES = 'rm,sh';
    await expect(new LocalCommandExecutor(root).execute({ command: 'rm' })).resolves.toMatchObject({ status: 'DENIED' });
  });
  it('调用方不能覆盖 PATH 或注入 NODE_OPTIONS', async () => {
    await expect(new LocalCommandExecutor(root).execute({ command: 'node', args: ['-e', "process.stdout.write(process.env.NODE_OPTIONS || 'clean')"], env: { PATH: root, NODE_OPTIONS: '--invalid-flag' } })).resolves.toMatchObject({ status: 'COMPLETED', stdout: 'clean' });
  });
});
