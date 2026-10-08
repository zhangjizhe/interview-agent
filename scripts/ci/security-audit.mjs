import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

let output;
try {
  output = execFileSync('pnpm', ['audit', '--prod', '--registry=https://registry.npmjs.org', '--json'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
} catch (error) {
  if (error.status !== 1 || !error.stdout) throw error;
  output = error.stdout;
}
const audit = JSON.parse(output);
if (!audit.metadata?.vulnerabilities || !audit.advisories) throw new Error('Incomplete audit response');
const patch = readFileSync(new URL('../../patches/braces@3.0.3.patch', import.meta.url));
const checksum = createHash('sha256').update(patch).digest('hex');
if (checksum !== '5119117206a8fea09e28f76c0c31763c259ec2e88e4a66ce1cf9d31306fd6eda') throw new Error('Security patch changed: review mitigation and regressions');
const advisories = Object.values(audit.advisories);
const unexpected = advisories.filter(item => !(item.module_name === 'braces' && item.github_advisory_id === 'GHSA-vfj7-8cjw-p6xm' && item.vulnerable_versions === '<=3.0.3'));
console.log(JSON.stringify({ upstream: audit.metadata.vulnerabilities, locallyMitigated: advisories.filter(item => !unexpected.includes(item)).map(item => item.github_advisory_id), patchSha256: checksum }));
if (unexpected.length) throw new Error(`Unreviewed production advisories: ${unexpected.map(item => item.github_advisory_id).join(', ')}`);
// This does not suppress or change pnpm's HIGH finding. CI also executes the
// installed SDK-chain depth, cyclic AST, width and normal-pattern regressions.
