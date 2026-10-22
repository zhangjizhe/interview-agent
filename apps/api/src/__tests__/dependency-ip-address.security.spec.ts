import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

// Follow the SDK's installed HTTP limiter dependency, not a test-only parser.
const sdkRequire = createRequire(require.resolve('@modelcontextprotocol/sdk/server/streamableHttp.js'));
const limiterRequire = createRequire(sdkRequire.resolve('express-rate-limit'));
const parserPath = limiterRequire.resolve('ip-address');

describe('installed MCP limiter IPv6 parser', () => {
  it('rejects large malformed zones without blocking the parent process', () => {
    const result = spawnSync(process.execPath, ['-e', `
      const assert = require('node:assert/strict');
      const { Address6 } = require(process.argv[1]);
      for (const end of ['\\n', '\\r', '\\u2028', '\\u2029']) {
        const malformed = '%'.repeat(1024 * 1024) + end;
        assert.equal(Address6.isValid(malformed), false);
        assert.throws(() => new Address6(malformed));
      }
      process.stdout.write('rejected all malformed zones');
    `, parserPath], { encoding: 'utf8', timeout: 3000 });
    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('rejected all malformed zones');
  });

  it('preserves valid zone parsing and limiter subnet/IPv4 behavior', () => {
    const { Address6 } = limiterRequire('ip-address');
    const { ipKeyGenerator } = sdkRequire('express-rate-limit');
    expect(new Address6('fe80::1%eth0').zone).toBe('%eth0');
    expect(new Address6('2001:db8::1/64').subnetMask).toBe(64);
    expect(ipKeyGenerator('2001:db8::1')).toBe('2001:db8::/56');
    expect(ipKeyGenerator('192.0.2.1')).toBe('192.0.2.1');
    expect(ipKeyGenerator('::ffff:192.0.2.1')).toBe('192.0.2.1');
  });
});
