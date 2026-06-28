/**
 * LoginPage — 完整登录页面（R-AUTH-1）
 *
 * 设计原则：
 * - 不是 modal，是完整独立页面
 * - 用户输入 ID → 实时校验（本地 + 远程 check）
 * - 提交后调 register / login 拿 token + user profile
 * - 成功后跳转回原页面（来源 page state from location）
 *
 * 防恶意注入 3 层：
 * 1. 本地 validateUserIdLocal（同步，毫秒级反馈）
 * 2. 远程 /api/auth/check/:userId（确认未被占用）
 * 3. DB CHECK 约束（后端兜底）
 *
 * UX 流程：
 * 1. 输入 ID → 实时校验（绿勾/红字）
 * 2. 已注册 ID → "登录"模式（按 Login 直接进首页）
 * 3. 未注册 ID → "注册"模式（按 Register 创建新身份）
 * 4. 顶栏："我的 ID 已是 X" → 一键切换
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  RESERVED_USER_IDS,
  SAFE_USERID_ERROR,
  SAFE_USERID_REGEX,
  suggestDefaultId,
  validateUserIdLocal,
  type CheckResponse,
} from '../utils/identity';

interface RemoteCheck {
  status: 'idle' | 'checking' | 'available' | 'taken' | 'invalid';
  reason?: string;
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isLoggedIn, userId: existingId, register, login } = useAuth();

  // 输入框受控值（用户原始输入，可能是大写，提交时 toLowerCase）
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 远程 check 状态（防抖）
  const [remote, setRemote] = useState<RemoteCheck>({ status: 'idle' });

  // 已登录用户访问 /login → 自动回首页（避免死锁）
  useEffect(() => {
    if (isLoggedIn) {
      const from = (location.state as any)?.from || '/';
      navigate(from, { replace: true });
    }
  }, [isLoggedIn, location.state, navigate]);

  // 实时本地校验（同步）
  const localCheck = useMemo(() => validateUserIdLocal(input), [input]);

  // 远程 check（防抖 350ms）
  useEffect(() => {
    if (!input) {
      setRemote({ status: 'idle' });
      return;
    }
    if (!localCheck.ok) {
      setRemote({ status: 'invalid', reason: localCheck.reason });
      return;
    }
    setRemote({ status: 'checking' });
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/auth/check/${encodeURIComponent(input.toLowerCase())}`);
        const data: CheckResponse = await r.json();
        if (data.available) {
          setRemote({ status: 'available' });
        } else {
          setRemote({ status: 'taken', reason: data.reason });
        }
      } catch {
        setRemote({ status: 'invalid', reason: '网络错误，请重试' });
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [input, localCheck]);

  /**
   * 提交：依据 remote.status 决定 register 还是 login
   */
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!localCheck.ok) {
        setError(localCheck.reason);
        return;
      }
      if (remote.status === 'checking') {
        setError('正在检查 ID，请稍候');
        return;
      }
      setSubmitting(true);
      setError(null);
      try {
        if (remote.status === 'available') {
          await register(input);
        } else {
          await login(input);
        }
        const from = (location.state as any)?.from || '/';
        navigate(from, { replace: true });
      } catch (err: any) {
        setError(err.message || '操作失败，请重试');
      } finally {
        setSubmitting(false);
      }
    },
    [input, localCheck, remote, register, login, location.state, navigate],
  );

  const isSubmitDisabled =
    submitting || !localCheck.ok || remote.status === 'checking' || remote.status === 'invalid';

  const buttonLabel = useMemo(() => {
    if (submitting) return '处理中...';
    if (remote.status === 'available') return '创建身份并进入';
    if (remote.status === 'taken') return '用此 ID 登录';
    if (remote.status === 'invalid') return '请检查 ID';
    return '请输入 ID';
  }, [submitting, remote.status]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo + 标题 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-2xl mb-4 shadow-lg">
            <span className="text-3xl">🎤</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">小面 · AI 面试官</h1>
          <p className="mt-2 text-sm text-slate-500">输入你的 ID 开始面试</p>
        </div>

        {/* 登录卡片 */}
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 md:p-8">
          {/* 已登录用户提示 */}
          {existingId && (
            <div className="mb-4 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
              当前身份：<span className="font-mono font-semibold">{existingId}</span>
              <button
                type="button"
                onClick={() => {
                  localStorage.removeItem('ia_userId');
                  localStorage.removeItem('ia_accessToken');
                  localStorage.removeItem('ia_userProfile');
                  window.dispatchEvent(new CustomEvent('ia:auth-change'));
                  window.location.reload();
                }}
                className="ml-2 text-amber-900 underline hover:text-amber-700"
              >
                切换
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* 输入框 */}
            <label className="block text-sm font-medium text-slate-700 mb-2">
              我的面试 ID
            </label>
            <div className="relative">
              <input
                type="text"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  setError(null);
                }}
                placeholder={suggestDefaultId()}
                autoFocus
                spellCheck={false}
                autoComplete="off"
                className={`w-full px-4 py-3 pr-10 rounded-lg border-2 transition outline-none font-mono text-base ${
                  !input
                    ? 'border-slate-200 focus:border-blue-500'
                    : localCheck.ok && remote.status === 'available'
                      ? 'border-emerald-400 focus:border-emerald-500 bg-emerald-50/30'
                      : localCheck.ok && remote.status === 'taken'
                        ? 'border-blue-400 focus:border-blue-500 bg-blue-50/30'
                        : 'border-rose-400 focus:border-rose-500 bg-rose-50/30'
                }`}
                maxLength={32}
              />
              {/* 状态图标 */}
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {!input && <span className="text-slate-300">⌨️</span>}
                {input && remote.status === 'checking' && (
                  <span className="inline-block w-4 h-4 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
                )}
                {input && remote.status === 'available' && (
                  <span className="text-emerald-500 text-lg">✓</span>
                )}
                {input && remote.status === 'taken' && (
                  <span className="text-blue-500 text-lg">→</span>
                )}
                {input && remote.status === 'invalid' && (
                  <span className="text-rose-500 text-lg">✕</span>
                )}
              </div>
            </div>

            {/* 提示文案 */}
            <div className="mt-2 min-h-[1.25rem] text-xs">
              {!input && (
                <span className="text-slate-400">
                  建议用你的 GitHub 用户名（如 <span className="font-mono">zhangjizhe</span> 或{' '}
                  <span className="font-mono">zhangjizhe-dev</span>）
                </span>
              )}
              {input && remote.status === 'available' && (
                <span className="text-emerald-600">✓ ID 可用，将创建新身份</span>
              )}
              {input && remote.status === 'taken' && (
                <span className="text-blue-600">→ 该 ID 已存在，将直接登录</span>
              )}
              {input && remote.status === 'invalid' && (
                <span className="text-rose-600">{remote.reason}</span>
              )}
            </div>

            {/* 提交按钮 */}
            <button
              type="submit"
              disabled={isSubmitDisabled}
              className="mt-5 w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition flex items-center justify-center gap-2"
            >
              {submitting && (
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              {buttonLabel}
            </button>

            {/* 错误提示 */}
            {error && (
              <div className="mt-3 px-3 py-2 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-700">
                {error}
              </div>
            )}
          </form>

          {/* 规则说明 */}
          <details className="mt-6 text-xs text-slate-500">
            <summary className="cursor-pointer hover:text-slate-700">ID 命名规则</summary>
            <ul className="mt-2 space-y-1 pl-4 list-disc">
              <li>3-32 字符，小写字母/数字开头</li>
              <li>后续字符允许：小写字母、数字、<code>-</code>、<code>_</code></li>
              <li>不能使用系统保留名（如 admin、system、demo 等）</li>
              <li>ID 一旦创建永久对应你的面试数据，请记牢</li>
            </ul>
          </details>

          {/* 保留名提示（折叠，默认不显示） */}
          <details className="mt-3 text-xs text-slate-400">
            <summary className="cursor-pointer hover:text-slate-600">系统保留名列表</summary>
            <div className="mt-2 p-2 bg-slate-50 rounded font-mono text-[10px] leading-relaxed">
              {Array.from(RESERVED_USER_IDS).sort().join(', ')}
            </div>
          </details>
        </div>

        {/* 底部说明 */}
        <p className="mt-6 text-center text-xs text-slate-400">
          demo 阶段 · 无需密码 · 输入 ID 即登录
          <br />
          商用前将替换为：邮箱注册 / OAuth / Magic Link
        </p>

        {/* 安全提示 */}
        <p className="mt-3 text-center text-[10px] text-slate-300">
          校验正则：<code className="font-mono">{SAFE_USERID_REGEX.source}</code>
          <br />
          {SAFE_USERID_ERROR}
        </p>
      </div>
    </div>
  );
}
