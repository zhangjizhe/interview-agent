/**
 * useAuth — 登录状态 / 当前用户管理 hook。
 *
 * 设计原则：
 * - localStorage 是 source of truth（同步可读，避免首屏闪烁）
 * - 写入 localStorage 后通过事件通知所有订阅者（storage event + 自定义 event）
 * - 不依赖 React Context（避免 Provider 嵌套），用全局 hook 即可
 *
 * 用法：
 * ```tsx
 * const { userId, profile, isLoggedIn, login, register, logout, switchUser } = useAuth();
 *
 * if (!isLoggedIn) return <Navigate to="/login" />;
 * ```
 */

import { useCallback, useEffect, useState } from 'react';
import {
  LS_ACCESS_TOKEN,
  LS_USER_ID,
  LS_USER_PROFILE,
  type CheckResponse,
  type LoginResponse,
  type RegisterResponse,
  type UserProfile,
} from '../utils/identity';

function readUserId(): string | null {
  try {
    return localStorage.getItem(LS_USER_ID);
  } catch {
    return null;
  }
}

function readToken(): string | null {
  try {
    return localStorage.getItem(LS_ACCESS_TOKEN);
  } catch {
    return null;
  }
}

function readProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem(LS_USER_PROFILE);
    if (!raw) return null;
    return JSON.parse(raw) as UserProfile;
  } catch {
    return null;
  }
}

/**
 * 写 localStorage + 广播变更事件（同窗口也能监听到）。
 */
function persistLogin(userId: string, token: string, profile: UserProfile): void {
  localStorage.setItem(LS_USER_ID, userId);
  localStorage.setItem(LS_ACCESS_TOKEN, token);
  localStorage.setItem(LS_USER_PROFILE, JSON.stringify(profile));
  window.dispatchEvent(new CustomEvent('ia:auth-change'));
}

function clearAuth(): void {
  localStorage.removeItem(LS_USER_ID);
  localStorage.removeItem(LS_ACCESS_TOKEN);
  localStorage.removeItem(LS_USER_PROFILE);
  window.dispatchEvent(new CustomEvent('ia:auth-change'));
}

export function useAuth() {
  const [userId, setUserId] = useState<string | null>(() => readUserId());
  const [token, setToken] = useState<string | null>(() => readToken());
  const [profile, setProfile] = useState<UserProfile | null>(() => readProfile());

  // 监听 storage 事件（跨窗口）+ 自定义事件（同窗口）
  useEffect(() => {
    const refresh = () => {
      setUserId(readUserId());
      setToken(readToken());
      setProfile(readProfile());
    };
    window.addEventListener('storage', refresh);
    window.addEventListener('ia:auth-change', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('ia:auth-change', refresh);
    };
  }, []);

  const isLoggedIn = !!userId && !!token;

  /**
   * R-AUTH-1 注册新 ID：检查可用性 + 创建 user + 登录。
   * 已存在 → 抛 Error('该 ID 已被占用')
   */
  const register = useCallback(async (rawUserId: string): Promise<UserProfile> => {
    const lowerId = rawUserId.toLowerCase();

    // 1. 检查可用性
    const checkRes = await fetch(`/api/auth/check/${encodeURIComponent(lowerId)}`);
    const check: CheckResponse = await checkRes.json();
    if (!check.available) {
      throw new Error(check.reason || 'ID 不可用');
    }

    // 2. 注册
    const regRes = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: lowerId }),
    });
    if (!regRes.ok) {
      const err = await regRes.json().catch(() => ({}));
      throw new Error(err.detail || `注册失败 (HTTP ${regRes.status})`);
    }
    const reg: RegisterResponse = await regRes.json();

    // 3. 登录拿 token
    const loginRes = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: lowerId }),
    });
    if (!loginRes.ok) {
      throw new Error(`登录失败 (HTTP ${loginRes.status})`);
    }
    const login: LoginResponse = await loginRes.json();

    const newProfile: UserProfile = {
      userId: login.userId,
      email: login.email,
      name: login.name,
    };
    persistLogin(login.userId, login.accessToken, newProfile);
    return newProfile;
  }, []);

  /**
   * 登录已存在的 ID。
   */
  const login = useCallback(async (rawUserId: string): Promise<UserProfile> => {
    const lowerId = rawUserId.toLowerCase();
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: lowerId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `登录失败 (HTTP ${res.status})`);
    }
    const data: LoginResponse = await res.json();
    const newProfile: UserProfile = {
      userId: data.userId,
      email: data.email,
      name: data.name,
    };
    persistLogin(data.userId, data.accessToken, newProfile);
    return newProfile;
  }, []);

  /**
   * 退出登录：清 localStorage（不删 user 记录，下次 login 还能恢复数据）。
   */
  const logout = useCallback(() => {
    clearAuth();
  }, []);

  /**
   * 切换 ID（退出 + 跳登录页由调用方决定）。
   */
  const switchUser = useCallback(() => {
    clearAuth();
  }, []);

  return {
    userId,
    token,
    profile,
    isLoggedIn,
    register,
    login,
    logout,
    switchUser,
  };
}
