import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
  LocalCommandExecutor,
  LocalWorkspaceProvider,
} from './command-executor';

describe('Local workspace execution', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-lab-workspace-'));
    await fs.mkdir(path.join(root, 'docs'));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('拒绝工作区逃逸与符号链接逃逸', async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-lab-outside-'));
    await fs.symlink(outside, path.join(root, 'escape'));
    const provider = new LocalWorkspaceProvider(root);

    await expect(provider.writeFile('../outside.txt', 'no')).rejects.toThrow('边界');
    await expect(provider.writeFile('escape/outside.txt', 'no')).rejects.toThrow('边界');
    await fs.rm(outside, { recursive: true, force: true });
  });

  it('plan 预设不允许写入', async () => {
    const provider = new LocalWorkspaceProvider(root, 'plan');

    await expect(provider.writeFile('docs/plan.txt', 'no')).rejects.toThrow('只读 plan');
  });

  it('使用最小环境变量，不向子进程传递敏感变量', async () => {
    process.env.TEST_SECRET_TOKEN = 'must-not-leak';
    const executor = new LocalCommandExecutor(root);

    const result = await executor.execute({
      command: 'node',
      args: ['-e', "process.stdout.write(process.env.TEST_SECRET_TOKEN || 'absent')"],
    });

    expect(result).toMatchObject({ status: 'COMPLETED', stdout: 'absent' });
  });

  it('拒绝无法验证的网络放行，并在超时后返回终态', async () => {
    const executor = new LocalCommandExecutor(root);

    await expect(executor.execute({
      command: 'node',
      args: ['-e', 'process.exit(0)'],
      network: 'ALLOW',
    })).resolves.toMatchObject({ status: 'DENIED' });

    await expect(executor.execute({
      command: 'node',
      args: ['-e', 'setInterval(() => {}, 1000)'],
      timeoutMs: 30,
    })).resolves.toMatchObject({ status: 'TIMED_OUT' });
  });
});
