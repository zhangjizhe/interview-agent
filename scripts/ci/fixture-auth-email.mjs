import { readFileSync } from 'node:fs';

export function readFixtureAuthCode(challengeId, outbox = process.env.FIXTURE_SMTP_OUTBOX || '/tmp/fixture-auth-mail-outbox/outbox.jsonl') {
  if (!/^[0-9a-f-]{36}$/i.test(challengeId || '')) throw new Error('A fixture challenge ID is required.');
  const rows = readFileSync(outbox, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
  const email = [...rows].reverse().find(row => row.challengeId === challengeId);
  if (!email) throw new Error('No synthetic email exists for this challenge.');
  const sections = email.message.split(/\r?\n\r?\n/);
  const headers = sections.shift() || '';
  let body = sections.join('\n');
  if (/content-transfer-encoding:\s*base64/i.test(headers)) body = Buffer.from(body.replace(/\s/g, ''), 'base64').toString('utf8');
  if (/content-transfer-encoding:\s*quoted-printable/i.test(headers)) {
    body = body.replace(/=\r?\n/g, '').replace(/=([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
  }
  const codes = body.match(/\d{6}/g) || [];
  if (codes.length !== 1) throw new Error('Synthetic email did not contain exactly one six-digit code.');
  return codes[0];
}
