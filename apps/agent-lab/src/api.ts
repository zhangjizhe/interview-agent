export const token = () => localStorage.getItem('ia_access_token');
export const role = () => localStorage.getItem('ia_user_role');

export async function logoutSession(): Promise<boolean> {
  const activeToken = token();
  if (!activeToken) return true;
  const response = await fetch('/api/auth/logout', {
    method: 'POST', headers: { Authorization: `Bearer ${activeToken}` }, signal: AbortSignal.timeout(10000),
  });
  if (!response.ok && response.status !== 401) throw new Error('退出未确认，请稍后重试。');
  if (token() && token() !== activeToken) return false;
  localStorage.removeItem('ia_access_token'); localStorage.removeItem('ia_user_role'); localStorage.removeItem('ia_userId');
  window.dispatchEvent(new Event('ia:session-expired'));
  return true;
}

export async function api(path: string, init?: RequestInit) {
  const activeToken = token();
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (activeToken) headers.set('Authorization', `Bearer ${activeToken}`);
  const response = await fetch(`/api${path}`, { ...init, headers });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401 && activeToken && token() === activeToken) {
    localStorage.removeItem('ia_access_token');
    localStorage.removeItem('ia_user_role');
    localStorage.removeItem('ia_userId');
    window.dispatchEvent(new Event('ia:session-expired'));
  }
  if (!response.ok) throw new Error(response.status === 401 ? '登录已过期，请重新登录。' : body.message || `HTTP ${response.status}`);
  return body;
}
