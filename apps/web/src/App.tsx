import { Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense, useEffect, useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppShell } from './components/AppShell';
import { HomePage } from './pages/HomePage';
import { SettingsPage } from './pages/SettingsPage';
import { initWebVitals } from './utils/web-vitals';
import { getSession, saveSession } from './utils/auth';

// 安全 JSON 解析：当 API 返回非 JSON（如 502 的 nginx HTML 错误页）时兜底
async function safeJson(res: Response): Promise<any> {
  const text = await res.text();
  if (!res.ok) {
    try {
      const data = JSON.parse(text);
      return { _error: true, _status: res.status, ...data };
    } catch {
      return { _error: true, _status: res.status, message: `服务不可用 (HTTP ${res.status})` };
    }
  }
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

// 路由级懒加载 — 首屏不加载面试房间、评价和管理兼容页面
const InterviewPage = lazy(() =>
  import('./pages/InterviewPage').then((m) => ({ default: m.InterviewPage })),
);
const ReportPage = lazy(() =>
  import('./pages/ReportPage').then((m) => ({ default: m.ReportPage })),
);
const TrainingPage = lazy(() =>
  import('./pages/TrainingPage').then((m) => ({ default: m.TrainingPage })),
);

function PageSpinner() {
  return (
    <div className="flex items-center justify-center h-[60vh]">
      <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  );
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState(getSession);
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [mode, setMode] = useState<'login' | 'register' | 'login-code' | 'claim' | 'claim-code' | 'forgot' | 'reset'>('login');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const handleExpired = () => {
      setError('登录已过期，请重新登录。');
      setSession(null);
    };
    window.addEventListener('ia:session-expired', handleExpired);
    return () => window.removeEventListener('ia:session-expired', handleExpired);
  }, []);

  const requestRegistrationCode = async () => {
    setError(''); setNotice(''); setSubmitting(true);
    try {
      const availability = await fetch(`/api/auth/check/${encodeURIComponent(userId)}`);
      const checked = await availability.json();
      if (!availability.ok || checked.available !== true) throw new Error(checked.reason || '用户名不可用，请使用已有账号登录或找回密码。');
      const response = await fetch('/api/auth/registration-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const data = await safeJson(response);
      if (!response.ok || data?._error) {
        throw new Error(data?.message || '验证码发送失败');
      }
      setChallengeId(data.challengeId); setNotice('若邮箱可用于注册且邮件服务正常，验证码会发送到该邮箱。如已注册，请返回登录或找回密码。');
    } catch (err: any) { setError(err.message || '验证码发送失败'); }
    finally { setSubmitting(false); }
  };

  const acceptSession = (data: any) => {
    const next = { accessToken: data.accessToken, userId: data.userId, email: data.email, role: data.role };
    saveSession(next); setSession(next);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setNotice(''); setSubmitting(true);
    try {
      let response: Response;
      let body: Record<string, unknown>;
      let endpoint: string;
      if (mode === 'register') {
        endpoint = '/api/auth/register'; body = { userId, email, password, challengeId, code };
      } else if (mode === 'login') {
        endpoint = '/api/auth/login'; body = { userId, password };
      } else if (mode === 'login-code') {
        endpoint = '/api/auth/login/verify-email'; body = { challengeId, code };
      } else if (mode === 'claim') {
        endpoint = '/api/auth/login/claim-email'; body = { userId, password, email };
      } else if (mode === 'claim-code') {
        endpoint = '/api/auth/login/claim-email/verify'; body = { userId, email, challengeId, code };
      } else if (mode === 'forgot') {
        endpoint = '/api/auth/password-reset/request'; body = { userId };
      } else {
        endpoint = '/api/auth/password-reset/complete'; body = { userId, challengeId, code, newPassword };
      }
      response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await safeJson(response);
      if (!response.ok || data?._error) throw new Error(data?.message || '认证失败');

      if (mode === 'register') {
        setPassword('');
        setMode('login'); setChallengeId(''); setCode('');
        setNotice('邮箱已验证，账号创建成功。请使用用户名和密码登录。');
        return;
      }
      if (mode === 'login' && data.requiresEmailClaim) {
        setMode('claim'); setNotice('这是尚未绑定真实邮箱的旧账号，请先验证一个可收信邮箱。'); return;
      }
      if (mode === 'login' && data.requiresEmailVerification) {
        setChallengeId(data.challengeId); setMode('login-code'); setNotice(`验证码已发送至 ${data.maskedEmail}。`); return;
      }
      if (mode === 'claim') {
        setChallengeId(data.challengeId); setMode('claim-code'); setNotice(`验证码已发送至 ${data.maskedEmail}。`); return;
      }
      if (mode === 'forgot') {
        setChallengeId(data.challengeId); setMode('reset');
        setNotice('若该账号已有已验证邮箱且邮件服务正常，验证码会发送到该邮箱；未绑定邮箱的旧账号需部署者协助恢复。'); return;
      }
      if (mode === 'reset') {
        setPassword(''); setNewPassword(''); setCode(''); setMode('login'); setNotice('密码已重置；请使用新密码登录。'); return;
      }
      acceptSession(data);
    } catch (err: any) {
      setError(err.message || '认证失败');
    } finally {
      setSubmitting(false);
    }
  };

  if (session) return <>{children}</>;

  return (
    <main className="studio-auth">
      <section className="studio-auth-story" aria-label="面试训练介绍">
        <div className="studio-auth-brand"><span className="brand-mark" aria-hidden="true">面</span>小面训练</div>
        <h2>准备得更清楚，<br />面试得更从容。</h2>
        <p>从目标岗位出发，把每一次模拟面试，变成有证据、有方向的成长。</p>
        <div className="studio-auth-steps"><div><span>01</span>明确你的目标岗位</div><div><span>02</span>进行有针对性的模拟面试</div><div><span>03</span>依据评价证据，继续练习</div></div>
      </section>
      <div className="studio-auth-form">
      <form onSubmit={submit} className="space-y-5">
        <div>
          <p className="mb-3 text-xs font-semibold tracking-wider text-blue-700">INTERVIEW STUDIO</p>
          <h1 className="font-semibold text-slate-900">{mode === 'register' ? '创建你的训练空间' : mode === 'login-code' ? '验证登录邮箱' : mode === 'claim' || mode === 'claim-code' ? '绑定并验证旧账号邮箱' : mode === 'forgot' || mode === 'reset' ? '找回密码' : '欢迎回来'}</h1>
          <p className="mt-1 text-sm text-slate-500">{mode === 'register' ? '先验证邮箱，再创建账号' : mode === 'login' ? '使用用户名和密码登录' : '验证码 10 分钟有效且只能使用一次'}</p>
        </div>
        {mode !== 'login-code' && mode !== 'claim-code' && mode !== 'reset' && <label className="block text-sm text-slate-700">
          用户名
          <input value={userId} onChange={(e) => setUserId(e.target.value.toLowerCase())} autoComplete="username" required className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2" />
        </label>}
        {(mode === 'login' || mode === 'register' || mode === 'claim') && <label className="block text-sm text-slate-700">
          密码
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" minLength={12} maxLength={128} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2" />
        </label>}
        {(mode === 'register' || mode === 'claim' || mode === 'claim-code') && <label className="block text-sm text-slate-700">邮箱<input value={email} onChange={(e) => { setEmail(e.target.value); setChallengeId(''); setCode(''); }} type="email" autoComplete="email" maxLength={254} required className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2" /></label>}
        {mode === 'register' && <div className="space-y-2"><button type="button" onClick={requestRegistrationCode} disabled={submitting || !email} className="w-full rounded-md border border-blue-600 py-2 text-sm text-blue-700">{submitting ? '正在发送…' : challengeId ? '重新发送验证码' : '发送邮箱验证码'}</button>{challengeId && <label className="block text-sm text-slate-700">邮箱验证码<input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2" /></label>}</div>}
        {(mode === 'login-code' || mode === 'claim-code' || mode === 'reset') && <label className="block text-sm text-slate-700">邮箱验证码<input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2" /></label>}
        {mode === 'reset' && <label className="block text-sm text-slate-700">新密码<input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} type="password" minLength={12} maxLength={128} autoComplete="new-password" required className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2" /></label>}
        {(mode === 'login-code' || mode === 'claim-code') && <button type="button" onClick={() => { setMode(mode === 'login-code' ? 'login' : 'claim'); setChallengeId(''); setCode(''); setError(''); setNotice('请再次提交账号密码以发送新验证码。'); }} className="w-full text-sm text-blue-700">重新发送验证码</button>}
        {mode === 'reset' && <button type="button" onClick={() => { setMode('forgot'); setChallengeId(''); setCode(''); setNewPassword(''); setError(''); setNotice('请重新请求找回验证码。'); }} className="w-full text-sm text-blue-700">重新发送验证码</button>}
        {mode === 'forgot' && <p className="text-sm text-slate-600">将验证码发送到该账号已验证的邮箱。</p>}
        {notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {mode !== 'register' || challengeId ? <button disabled={submitting} className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-md py-2 text-sm font-medium">{submitting ? '处理中...' : mode === 'register' ? '验证并创建账号' : mode === 'login' ? '登录' : mode === 'login-code' || mode === 'claim-code' ? '验证并登录' : mode === 'claim' ? '发送验证邮件' : mode === 'forgot' ? '发送找回验证码' : '重置密码'}</button> : null}
        {mode === 'login' && <button type="button" onClick={() => { setMode('forgot'); setError(''); setNotice(''); }} className="w-full text-sm text-blue-700">忘记密码？</button>}
        {(mode === 'login' || mode === 'register') && <button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setNotice(''); setChallengeId(''); setCode(''); }} className="w-full text-sm text-blue-700">{mode === 'register' ? '已有账号，去登录' : '没有账号，创建账号'}</button>}
        {mode !== 'login' && mode !== 'register' && <button type="button" onClick={() => { setMode('login'); setError(''); setNotice(''); setChallengeId(''); setCode(''); }} className="w-full text-sm text-blue-700">返回登录</button>}
      </form>
      </div>
    </main>
  );
}

export default function App() {
  // 初始化 Web Vitals 性能监控
  useEffect(() => { initWebVitals(); }, []);

  return (
    <AuthGate>
      <ErrorBoundary>
        <Suspense fallback={<PageSpinner />}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/practice" element={<HomePage openPractice />} />
              <Route path="/interviews" element={<HomePage view="interviews" />} />
              <Route path="/training" element={<TrainingPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/question-bank" element={<Navigate to="/" replace />} />
              <Route path="/tools" element={<Navigate to="/settings" replace />} />
              <Route path="/admin/mcp" element={<Navigate to="/" replace />} />
              <Route path="/reports/:id" element={<ReportPage />} />
            </Route>
            <Route path="/interview/:id" element={<InterviewPage />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </AuthGate>
  );
}
