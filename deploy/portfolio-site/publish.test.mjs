import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import assert from 'node:assert/strict';

const dir = dirname(fileURLToPath(import.meta.url));
const publish = readFileSync(resolve(dir, 'publish.sh'), 'utf8');
const readme = readFileSync(resolve(dir, 'README.md'), 'utf8');
const install = readFileSync(resolve(dir, 'install-watchdog.sh'), 'utf8');

test('publish script never embeds secrets or product-stack restarts', () => {
  assert.doesNotMatch(publish, /eyJ[A-Za-z0-9._-]{20,}/);
  assert.doesNotMatch(publish, /AGENT_LAB_GATEWAY_KEY=/);
  assert.match(publish, /HOST=127\.0\.0\.1/);
  assert.match(publish, /interview-web/);
  assert.match(publish, /Refusing to touch product container/);
  assert.match(publish, /zhezone-named-tunnel/);
  assert.match(publish, /docker start/);
  assert.doesNotMatch(publish, /docker compose .*down -v/);
  assert.doesNotMatch(publish, /--token/);
});

test('docs and watchdog stay on the site-only boundary', () => {
  assert.match(readme, /不重建、不重启 Interview/);
  assert.match(readme, /网关密钥/);
  assert.match(readme, /不会自动拉取/);
  assert.match(install, /--ensure-only/);
  assert.doesNotMatch(install, /eyJ[A-Za-z0-9._-]{20,}/);
  assert.doesNotMatch(install, /--token/);
});
