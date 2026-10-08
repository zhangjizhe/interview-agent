import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installAuthenticatedFetch, logoutSession, saveSession } from './auth';
import { api as labApi, logoutSession as labLogout } from '../../../agent-lab/src/api';

describe('session expiry at the transport boundary', () => {
  let native: any;
  const session = (accessToken: string) => saveSession({ accessToken, userId: 'synthetic-user', email: 'fixture@example.invalid', role: 'ADMIN' });
  beforeEach(() => { localStorage.clear(); native = vi.fn(); vi.stubGlobal('fetch', native); });
  afterEach(() => { localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  it.each([logoutSession, labLogout])('revokes the active server session before clearing local credentials', async logout => {
    session('fixture-old'); native.mockResolvedValue(new Response('{}'));
    await expect(logout()).resolves.toBe(true);
    expect(native.mock.calls[0][0]).toBe('/api/auth/logout');
    expect(native.mock.calls[0][1].headers.Authorization).toBe('Bearer fixture-old');
    expect(localStorage.getItem('ia_access_token')).toBeNull();
  });
  it.each([logoutSession, labLogout])('keeps failed logout retryable and protects a concurrent new login', async logout => {
    session('fixture-old'); native.mockResolvedValueOnce(new Response('{}', { status: 503 }));
    await expect(logout()).rejects.toThrow('退出未确认');
    expect(localStorage.getItem('ia_access_token')).toBe('fixture-old');
    let resolve!: (response: Response) => void;
    native.mockReturnValueOnce(new Promise<Response>(done => { resolve = done; }));
    const previous = logout(); session('fixture-new'); resolve(new Response('{}'));
    await expect(previous).resolves.toBe(false);
    expect(localStorage.getItem('ia_access_token')).toBe('fixture-new');
  });
  it('clears the current failed session and emits expiry once', async () => {
    session('fixture-old'); native.mockResolvedValue(new Response('{}', { status: 401 }));
    const expired = vi.fn(); window.addEventListener('ia:session-expired', expired);
    try {
      installAuthenticatedFetch(); await window.fetch('/api/interview/list'); await window.fetch('/api/interview/list');
      expect(localStorage.getItem('ia_access_token')).toBeNull(); expect(expired).toHaveBeenCalledTimes(1);
    } finally { window.removeEventListener('ia:session-expired', expired); }
  });
  it('does not clear a new session when the previous request finishes with 401', async () => {
    session('fixture-old'); let resolve!: (response: Response) => void;
    native.mockReturnValue(new Promise<Response>(done => { resolve = done; }));
    installAuthenticatedFetch(); const previous = window.fetch('/api/interview/list');
    session('fixture-new'); resolve(new Response('{}', { status: 401 })); await previous;
    expect(localStorage.getItem('ia_access_token')).toBe('fixture-new');
  });
  it('preserves Request headers and only attaches credentials to same-origin APIs', async () => {
    session('fixture-current'); native.mockResolvedValue(new Response('{}'));
    installAuthenticatedFetch();
    await window.fetch(new Request(`${window.location.origin}/api/interview/list`, { headers: { 'X-Fixture': 'retained' } }));
    const headers = native.mock.calls[0][1].headers;
    expect(headers.get('X-Fixture')).toBe('retained'); expect(headers.get('Authorization')).toBe('Bearer fixture-current');
    await window.fetch('https://example.invalid/api/resource');
    expect(native.mock.calls[1][1]).toBeUndefined();
  });
  it('does not expire sessions on server failures or permission denial', async () => {
    session('fixture-current'); native.mockResolvedValueOnce(new Response('{}', { status: 503 })).mockResolvedValueOnce(new Response('{}', { status: 403 }));
    installAuthenticatedFetch(); await window.fetch('/api/interview/list'); await window.fetch('/api/interview/list');
    expect(localStorage.getItem('ia_access_token')).toBe('fixture-current');
  });
  it('uses the same expiry contract for all Lab workspaces', async () => {
    session('fixture-lab'); native.mockResolvedValue(new Response('{}', { status: 401 }));
    await expect(labApi('/agent-lab/agents')).rejects.toThrow('登录已过期');
    expect(localStorage.getItem('ia_access_token')).toBeNull();
  });
  it('keeps a newer Lab login on a late 401', async () => {
    session('fixture-old'); let resolve!: (response: Response) => void;
    native.mockReturnValue(new Promise<Response>(done => { resolve = done; }));
    const previous = labApi('/agent-lab/agents'); session('fixture-new');
    resolve(new Response('{}', { status: 401 })); await expect(previous).rejects.toThrow('登录已过期');
    expect(localStorage.getItem('ia_access_token')).toBe('fixture-new');
  });
});
