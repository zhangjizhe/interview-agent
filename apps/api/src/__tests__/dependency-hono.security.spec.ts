import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

// Child Node loads both real CJS/ESM SDK chains without Jest transforming their imports.
// HTTP requests remain on a synthetic loopback server; no external provider or account.
describe('installed MCP HTTP adapter security and compatibility', () => {
  it('rejects the static double-decode bypass while preserving SDK initialization and tools', () => {
    const output = execFileSync(process.execPath, ['--test', '--test-reporter=tap', resolve(__dirname, '../../../../scripts/ci/hono-node-server.security.test.mjs')], {
      encoding: 'utf8', timeout: 20000, maxBuffer: 1024 * 1024,
    });
    expect(output).toContain('# pass 5');
    expect(output).toContain('# fail 0');
  });
});
