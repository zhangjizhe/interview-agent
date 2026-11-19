import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_SESSION_STORAGE_KEY, clearSession, getSession, installAuthenticatedFetch, logoutSession, saveSession } from './auth';
import { api as labApi, logoutSession as labLogout } from '../../../agent-lab/src/api';

describe('session expiry at the transport boundary', () => {
  let native: any;
  const session = (accessToken: string) => saveSession({ accessToken, userId: 'synthetic-user', email: 'fixture@example.invalid', role: 'ADMIN' });
  const legacySession = (accessToken: string) => { localStorage.setItem('ia_access_token', accessToken); localStorage.setItem('ia_userId', 'synthetic-user'); localStorage.setItem('ia_user_role', 'ADMIN'); };
  const currentToken = () => getSession()?.accessToken ?? null;
  beforeEach(() => { localStorage.clear(); native = vi.fn(); vi.stubGlobal('fetch', native); });
  afterEach(() => { localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  it.each([logoutSession, labLogout])('revokes the active server session before clearing local credentials', async logout => {
    (logout === labLogout ? legacySession : session)('fixture-old'); native.mockResolvedValue(new Response('{}'));
    await expect(logout()).resolves.toBe(true);
    expect(native.mock.calls[0][0]).toBe('/api/auth/logout');
    expect(native.mock.calls[0][1].headers.Authorization).toBe('Bearer fixture-old');
    expect(currentToken()).toBeNull();
  });
  it.each([logoutSession, labLogout])('keeps failed logout retryable and protects a concurrent new login', async logout => {
    const seed = logout === labLogout ? legacySession : session;
    seed('fixture-old'); native.mockResolvedValueOnce(new Response('{}', { status: 503 }));
    await expect(logout()).rejects.toThrow('退出未确认');
    expect(currentToken()).toBe('fixture-old');
    let resolve!: (response: Response) => void;
    native.mockReturnValueOnce(new Promise<Response>(done => { resolve = done; }));
    const previous = logout(); seed('fixture-new'); resolve(new Response('{}'));
    await expect(previous).resolves.toBe(false);
    expect(currentToken()).toBe('fixture-new');
  });
  it('clears the current failed session and emits expiry once', async () => {
    session('fixture-old'); native.mockResolvedValue(new Response('{}', { status: 401 }));
    const expired = vi.fn(); window.addEventListener('ia:session-expired', expired);
    try {
      installAuthenticatedFetch(); await window.fetch('/api/interview/list'); await window.fetch('/api/interview/list');
      expect(currentToken()).toBeNull(); expect(expired).toHaveBeenCalledTimes(1);
    } finally { window.removeEventListener('ia:session-expired', expired); }
  });
  it('does not clear a new session when the previous request finishes with 401', async () => {
    session('fixture-old'); let resolve!: (response: Response) => void;
    native.mockReturnValue(new Promise<Response>(done => { resolve = done; }));
    installAuthenticatedFetch(); const previous = window.fetch('/api/interview/list');
    session('fixture-new'); resolve(new Response('{}', { status: 401 })); await previous;
    expect(currentToken()).toBe('fixture-new');
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
    expect(currentToken()).toBe('fixture-current');
  });
  it('uses the same expiry contract for all Lab workspaces', async () => {
    legacySession('fixture-lab'); native.mockResolvedValue(new Response('{}', { status: 401 }));
    await expect(labApi('/agent-lab/agents')).rejects.toThrow('登录已过期');
    expect(currentToken()).toBeNull();
  });
  it('keeps a newer Lab login on a late 401', async () => {
    legacySession('fixture-old'); let resolve!: (response: Response) => void;
    native.mockReturnValue(new Promise<Response>(done => { resolve = done; }));
    const previous = labApi('/agent-lab/agents'); legacySession('fixture-new');
    resolve(new Response('{}', { status: 401 })); await expect(previous).rejects.toThrow('登录已过期');
    expect(currentToken()).toBe('fixture-new');
  });
});


describe('atomic Web session publication', () => {
  const account = (userId: string) => ({ userId, accessToken: `SYNTHETIC-${userId}`, email: `${userId}@example.invalid`, role: 'USER' as const });
  beforeEach(() => localStorage.clear());
  afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

  it('publishes account and token together in one storage operation', () => {
    const write = vi.spyOn(Storage.prototype, 'setItem');
    saveSession(account('a'));
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0]).toBe(AUTH_SESSION_STORAGE_KEY);
    expect(JSON.parse(write.mock.calls[0][1]).session).toEqual(account('a'));
    expect(getSession()).toEqual(account('a'));
  });

  it('never combines credentials when another writer publishes during a login', () => {
    const write = Storage.prototype.setItem;
    let interleaved = false;
    const observed: unknown[] = [];
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      write.call(this, key, value);
      if (key === AUTH_SESSION_STORAGE_KEY) {
        observed.push(getSession());
        if (!interleaved) { interleaved = true; saveSession(account('b')); }
      }
    });
    saveSession(account('a'));
    expect(observed).toEqual([account('a'), account('b')]);
    expect(getSession()).toEqual(account('b'));
  });

  it('does not erase a newer snapshot while cleaning legacy fields on logout', () => {
    saveSession(account('a'));
    const remove = Storage.prototype.removeItem;
    let interleaved = false;
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (key) {
      if (!interleaved) { interleaved = true; saveSession(account('b')); }
      remove.call(this, key);
    });
    clearSession();
    expect(getSession()).toEqual(account('b'));
  });

  it.each(['broken json', JSON.stringify({ session: null }), JSON.stringify({ session: { userId: 'partial' } })])('fails closed without resurrecting legacy credentials: %s', value => {
    localStorage.setItem('ia_access_token', 'SYNTHETIC-old');
    localStorage.setItem('ia_userId', 'old');
    localStorage.setItem(AUTH_SESSION_STORAGE_KEY, value);
    expect(getSession()).toBeNull();
  });

  it('reads a legacy login before the first snapshot and ignores later partial legacy writes', () => {
    localStorage.setItem('ia_access_token', 'SYNTHETIC-old');
    localStorage.setItem('ia_userId', 'old');
    expect(getSession()?.userId).toBe('old');
    saveSession(account('b'));
    localStorage.setItem('ia_access_token', 'SYNTHETIC-uncommitted');
    localStorage.setItem('ia_userId', 'incomplete');
    expect(getSession()).toEqual(account('b'));
  });
});
