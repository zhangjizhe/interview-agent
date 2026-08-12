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

    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${token}`);
    return nativeFetch(input, { ...init, headers });
  };
}
