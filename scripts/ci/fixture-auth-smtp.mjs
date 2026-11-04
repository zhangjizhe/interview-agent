import { appendFileSync, chmodSync, readFileSync } from 'node:fs';
import tls from 'node:tls';

const key = readFileSync(process.env.FIXTURE_SMTP_KEY || '/tmp/fixture-auth-mail/key.pem');
const cert = readFileSync(process.env.FIXTURE_SMTP_CERT || '/tmp/fixture-auth-mail/cert.pem');
const outbox = process.env.FIXTURE_SMTP_OUTBOX || '/tmp/fixture-auth-mail/outbox.jsonl';
try { chmodSync(outbox, 0o600); } catch { appendFileSync(outbox, '', { mode: 0o600 }); chmodSync(outbox, 0o600); }

const server = tls.createServer({ key, cert }, socket => {
  socket.setEncoding('utf8');
  socket.write('220 fixture SMTP ready\r\n');
  let buffer = '';
  let inData = false;
  let authState = '';
  let data = [];
  let recipients = [];
  socket.on('data', chunk => {
    buffer += chunk;
    while (buffer.includes('\r\n')) {
      const end = buffer.indexOf('\r\n');
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      if (inData) {
        if (line === '.') {
          inData = false;
          const message = data.join('\r\n').replace(/\r\n\.\./g, '\r\n.');
          const challengeId = message.match(/^x-auth-challenge-id:\s*([^\r\n]+)/im)?.[1]?.trim();
          const purpose = message.match(/^x-auth-purpose:\s*([^\r\n]+)/im)?.[1]?.trim();
          const sender = message.match(/^from:\s*([^\r\n]+)/im)?.[1]?.trim();
          if (challengeId && purpose && recipients.length) {
            appendFileSync(outbox, `${JSON.stringify({ challengeId, purpose, from: sender, to: recipients, message, receivedAt: new Date().toISOString() })}\n`, { mode: 0o600 });
            chmodSync(outbox, 0o600);
          }
          data = [];
          recipients = [];
          socket.write('250 message accepted\r\n');
        } else {
          data.push(line);
        }
        continue;
      }
      if (authState === 'username') { authState = 'password'; socket.write('334 UGFzc3dvcmQ6\r\n'); continue; }
      if (authState === 'password') { authState = ''; socket.write('235 authenticated\r\n'); continue; }
      if (authState === 'plain') { authState = ''; socket.write('235 authenticated\r\n'); continue; }
      const command = line.split(' ', 1)[0].toUpperCase();
      if (command === 'EHLO' || command === 'HELO') socket.write('250-fixture-smtp\r\n250 AUTH PLAIN LOGIN\r\n');
      else if (command === 'AUTH') {
        if (/^AUTH\s+PLAIN\s+\S+/i.test(line)) socket.write('235 authenticated\r\n');
        else if (/^AUTH\s+PLAIN$/i.test(line)) { authState = 'plain'; socket.write('334 \r\n'); }
        else if (/^AUTH\s+LOGIN$/i.test(line)) { authState = 'username'; socket.write('334 VXNlcm5hbWU6\r\n'); }
        else socket.write('535 authentication failed\r\n');
      } else if (command === 'MAIL') socket.write('250 sender accepted\r\n');
      else if (command === 'RCPT') { recipients.push(line.replace(/^RCPT\s+TO:\s*/i, '').replace(/[<>]/g, '')); socket.write('250 recipient accepted\r\n'); }
      else if (command === 'DATA') { inData = true; socket.write('354 end with <CRLF>.<CRLF>\r\n'); }
      else if (command === 'RSET' || command === 'NOOP') socket.write('250 ok\r\n');
      else if (command === 'QUIT') { socket.write('221 bye\r\n'); socket.end(); }
      else if (/^[A-Za-z0-9+/=]+$/.test(line)) socket.write('235 authenticated\r\n');
      else socket.write('250 ok\r\n');
    }
  });
});

server.listen(2465, '0.0.0.0');
process.on('SIGTERM', () => server.close(() => process.exit(0)));
