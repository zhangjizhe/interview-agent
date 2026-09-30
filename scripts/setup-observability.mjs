import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';

// Local secrets only. Do not print credentials or rewrite existing environment settings.
const directory = '.local-backups/observability';
mkdirSync(directory, { recursive: true, mode: 0o700 });
chmodSync(directory, 0o700);
const env = existsSync('.env') ? readFileSync('.env', 'utf8') : '';
const existing = env.match(/^METRICS_TOKEN=(.+)$/m)?.[1]?.trim();
const token = existing || randomBytes(32).toString('hex');
if (!/^[a-zA-Z0-9_-]{32,256}$/.test(token)) throw new Error('METRICS_TOKEN must be an unquoted 32–256 character secret');
if (existsSync(`${directory}/metrics-token`)) chmodSync(`${directory}/metrics-token`, 0o600);
writeFileSync(`${directory}/metrics-token`, token, { mode: 0o600 });
if (!existing) writeFileSync('.env', `${env}\nMETRICS_TOKEN=${token}\n`, { mode: 0o600 });
if (!existsSync(`${directory}/grafana-password`)) writeFileSync(`${directory}/grafana-password`, randomBytes(24).toString('hex'), { mode: 0o600 });
for (const file of ['metrics-token', 'grafana-password']) chmodSync(`${directory}/${file}`, 0o444);
console.log('Observability credentials prepared locally; no credentials printed.');
