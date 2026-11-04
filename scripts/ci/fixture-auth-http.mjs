import { readFixtureAuthCode } from './fixture-auth-email.mjs';

// Only mail-start requests use the bounded SMTP fallback budget; the first TLS
// fixture greeting deliberately stalls. Other business request deadlines stay unchanged.
const expectSuccess = (response, label) => {
  if (!response || response.status !== 200) throw new Error(`Synthetic ${label} failed with HTTP ${response?.status ?? 'unknown'}.`);
  return response.data;
};

export async function registerFixtureUser(request, userId, password) {
  const email = `${userId}@fixture.test`;
  const codeRequest = expectSuccess(await request('/auth/registration-code', { method: 'POST', timeoutMs: 90000, body: { email } }), 'registration code request');
  const registered = expectSuccess(await request('/auth/register', { method: 'POST', body: { userId, email, password, challengeId: codeRequest.challengeId, code: readFixtureAuthCode(codeRequest.challengeId) } }), 'registration');
  return { ...registered, email };
}

export async function loginFixtureUser(request, userId, password) {
  const started = expectSuccess(await request('/auth/login', { method: 'POST', timeoutMs: 90000, body: { userId, password } }), 'password login');
  if (started.requiresEmailClaim) throw new Error('Synthetic fixture account unexpectedly needs legacy email claim.');
  if (!started.accessToken || !started.refreshToken || started.requiresEmailVerification) throw new Error('Password login must issue a session without sending email.');
  return started;
}

export async function createFixtureUserSession(request, userId, password) {
  await registerFixtureUser(request, userId, password);
  return loginFixtureUser(request, userId, password);
}
