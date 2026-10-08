const ACCESS_TOKEN_KEY = 'ia_access_token';
const USER_ID_KEY = 'ia_userId';

export interface AuthSession {
  accessToken: string;
  userId: string;
  email: string;
  role: 'USER' | 'ADMIN';
}

export function getSession(): AuthSession | null {
  const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
  const userId = localStorage.getItem(USER_ID_KEY);
  if (!accessToken || !userId) return null;
  return {
    accessToken,
    userId,
    email: `${userId}@local`,
    role: (localStorage.getItem('ia_user_role') as AuthSession['role']) || 'USER',
  };
}

export function saveSession(session: AuthSession): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, session.accessToken);
  localStorage.setItem(USER_ID_KEY, session.userId);
  localStorage.setItem('ia_user_role', session.role);
}

export function clearSession(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(USER_ID_KEY);
  localStorage.removeItem('ia_user_role');
}

/** Keep a failed logout retryable, and never erase a newer login. */
export async function logoutSession(): Promise<boolean> {
  const activeToken = localStorage.getItem(ACCESS_TOKEN_KEY);
  if (!activeToken) return true;
  const response = await fetch('/api/auth/logout', {
    method: 'POST', headers: { Authorization: `Bearer ${activeToken}` }, signal: AbortSignal.timeout(10000),
  });
  if (!response.ok && response.status !== 401) throw new Error('退出未确认，请稍后重试。');
  if (localStorage.getItem(ACCESS_TOKEN_KEY) !== activeToken && localStorage.getItem(ACCESS_TOKEN_KEY)) return false;
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
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!isApiRequest || !token) return nativeFetch(input, init);

    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
    headers.set('Authorization', `Bearer ${token}`);
    const response = await nativeFetch(input, { ...init, headers });
    // A response from the previous session must not erase a newly signed-in one.
    if (response.status === 401 && localStorage.getItem(ACCESS_TOKEN_KEY) === token) {
      clearSession();
      window.dispatchEvent(new Event('ia:session-expired'));
    }
    return response;
  };
}
