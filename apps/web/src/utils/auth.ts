const ACCESS_TOKEN_KEY = 'ia_access_token';
const USER_ID_KEY = 'ia_userId';
const EMAIL_KEY = 'ia_email';
export const AUTH_SESSION_STORAGE_KEY = 'ia_auth_session_v1';

export interface AuthSession {
  accessToken: string;
  userId: string;
  email: string;
  role: 'USER' | 'ADMIN';
}

export function getSession(): AuthSession | null {
  const published = localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
  if (published !== null) {
    // A single storage write publishes the whole account. Invalid records and
    // signed-out tombstones fail closed; never resurrect stale legacy fields.
    try {
      const session = JSON.parse(published).session;
      if (!session || typeof session.accessToken !== 'string' || !session.accessToken
        || typeof session.userId !== 'string' || !session.userId
        || typeof session.email !== 'string' || !['USER', 'ADMIN'].includes(session.role)) return null;
      return { accessToken: session.accessToken, userId: session.userId, email: session.email, role: session.role };
    } catch { return null; }
  }
  // Read pre-upgrade sessions until the next login/logout publishes a snapshot.
  const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
  const userId = localStorage.getItem(USER_ID_KEY);
  if (!accessToken || !userId) return null;
  return {
    accessToken, userId,
    email: localStorage.getItem(EMAIL_KEY) || `${userId}@local`,
    role: localStorage.getItem('ia_user_role') === 'ADMIN' ? 'ADMIN' : 'USER',
  };
}

function publishSession(session: AuthSession | null): void {
  localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({ session, revision: crypto.randomUUID() }));
  window.dispatchEvent(new Event('ia:session-changed'));
}

export function saveSession(session: AuthSession): void {
  publishSession(session);
  removeLegacySession();
}

export function clearSession(): void {
  publishSession(null);
  removeLegacySession();
}

function removeLegacySession(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(USER_ID_KEY);
  localStorage.removeItem(EMAIL_KEY);
  localStorage.removeItem('ia_user_role');
}

/** Keep a failed logout retryable, and never erase a newer login. */
export async function logoutSession(): Promise<boolean> {
  const activeToken = getSession()?.accessToken;
  if (!activeToken) return true;
  const response = await fetch('/api/auth/logout', {
    method: 'POST', headers: { Authorization: `Bearer ${activeToken}` }, signal: AbortSignal.timeout(10000),
  });
  if (!response.ok && response.status !== 401) throw new Error('退出未确认，请稍后重试。');
  if (getSession()?.accessToken && getSession()?.accessToken !== activeToken) return false;
  clearSession();
  window.dispatchEvent(new Event('ia:session-expired'));
  return true;
}

/**
 * All same-origin API requests receive the active access token. Keeping this at
 * the transport boundary prevents individual UI views from forgetting auth.
 */
export function installAuthenticatedFetch(): void {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const isApiRequest = url.startsWith('/api/') || url.startsWith(`${window.location.origin}/api/`);
    const token = getSession()?.accessToken;
    if (!isApiRequest || !token) return nativeFetch(input, init);

    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
    headers.set('Authorization', `Bearer ${token}`);
    const response = await nativeFetch(input, { ...init, headers });
    // A response from the previous session must not erase a newly signed-in one.
    if (response.status === 401 && getSession()?.accessToken === token) {
      clearSession();
      window.dispatchEvent(new Event('ia:session-expired'));
    }
    return response;
  };
}
