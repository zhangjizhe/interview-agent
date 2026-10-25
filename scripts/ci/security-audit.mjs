import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { completeAudit, reviewedAdvisory } from './security-audit-policy.mjs';

let output;
try {
  output = execFileSync('pnpm', ['audit', '--prod', '--registry=https://registry.npmjs.org', '--json'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
} catch (error) {
  if (error.status !== 1 || !error.stdout) throw error;
  output = error.stdout;
}
const audit = JSON.parse(output);
if (!completeAudit(audit)) throw new Error('Incomplete audit response');
const patch = readFileSync(new URL('../../patches/braces@3.0.3.patch', import.meta.url));
const checksum = createHash('sha256').update(patch).digest('hex');
if (checksum !== '5119117206a8fea09e28f76c0c31763c259ec2e88e4a66ce1cf9d31306fd6eda') throw new Error('Security patch changed: review mitigation and regressions');
const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
if (manifest.pnpm?.patchedDependencies?.['zod@3.25.76'] !== 'patches/zod@3.25.76.patch') throw new Error('Missing reviewed Zod patch registration');
const zodPatch = readFileSync(new URL('../../patches/zod@3.25.76.patch', import.meta.url));
const zodChecksum = createHash('sha256').update(zodPatch).digest('hex');
if (zodChecksum !== '4e2e8949d787d7c7fb0bd9177a0c56dcc401537945d389846f25f89f70d62929') throw new Error('Zod patch changed: review mitigation and regressions');
const apiRequire = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const zodRoot = dirname(apiRequire.resolve('zod/package.json'));
if (JSON.parse(readFileSync(join(zodRoot, 'package.json'), 'utf8')).version !== '3.25.76') throw new Error('Unexpected Zod compatibility version');
const installedHashes = {
  'v3/types.cjs': 'a13cb1d1f0277d6c488e5bb020b3d3ff03a3f59c164e0959109df811aa21d714',
  'v3/types.js': 'f974db1b9ba7787f523c9d0dd6589cd4ce42016527eb738e2591295aa9f21bf8',
  'src/v3/types.ts': 'b92f528d4fbca1b1236865eb8006590922c9bea82703404c1399b5855b6b016a',
  'v4/core/schemas.cjs': 'c9fc03c3da9c2a5c89f7cc0553316056f84b0a34fa4ca3de7ae59e099bd5f4a9',
  'v4/core/schemas.js': 'b727cabc3c47334329b1ccee668b32b6b7cd66cc7981b398541dd6aa5d2a6749',
  'src/v4/core/schemas.ts': 'e77c2de03cf120b3ed15ac8020145e47ba968684d8875685736704fb7658a15f',
};
for (const [file, expected] of Object.entries(installedHashes)) {
  if (createHash('sha256').update(readFileSync(join(zodRoot, file))).digest('hex') !== expected) throw new Error(`Installed Zod mitigation missing or changed: ${file}`);
}
const advisories = Object.values(audit.advisories);
const unexpected = advisories.filter(item => !reviewedAdvisory(item));
console.log(JSON.stringify({ upstream: audit.metadata.vulnerabilities, locallyMitigated: advisories.filter(item => !unexpected.includes(item)).map(item => item.github_advisory_id), patchSha256: checksum, zodPatchSha256: zodChecksum }));
if (unexpected.length) throw new Error(`Unreviewed production advisories: ${unexpected.map(item => item.github_advisory_id).join(', ')}`);
// This does not suppress or change pnpm's HIGH finding. CI also executes the
// installed SDK-chain pattern regressions and Zod collection/compatibility tests.
// Zod3 remains an upstream HIGH finding; only the exact reviewed backport is accepted locally.
