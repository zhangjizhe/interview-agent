import { readFixtureAuthCode } from './fixture-auth-email.mjs';

process.stdout.write(readFixtureAuthCode(process.argv[2] || ''));
