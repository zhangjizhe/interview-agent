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

function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState(getSession);
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const handleExpired = () => {
      setError('登录已过期，请重新登录。');
      setSession(null);
    };
    window.addEventListener('ia:session-expired', handleExpired);
    return () => window.removeEventListener('ia:session-expired', handleExpired);
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const endpoint = registering ? '/api/auth/register' : '/api/auth/login';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, password }),
      });
      const data = await safeJson(response);
      if (!response.ok || data?._error) {
        throw new Error(data?.message || '认证失败');
      }

      if (registering) {
        setRegistering(false);
        setPassword('');
        setError('账号已创建，请登录。');
        return;
      }

      const next = {
        accessToken: data.accessToken,
        userId: data.userId,
        email: data.email,
        role: data.role,
      };
      saveSession(next);
      setSession(next);
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
          <h1 className="font-semibold text-slate-900">{registering ? '创建你的训练空间' : '欢迎回来'}</h1>
          <p className="mt-1 text-sm text-slate-500">{registering ? '创建账号以保护你的面试与简历数据' : '登录以继续你的面试记录'}</p>
        </div>
        <label className="block text-sm text-slate-700">
          用户名
          <input value={userId} onChange={(e) => setUserId(e.target.value.toLowerCase())} autoComplete="username" required className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2" />
        </label>
        <label className="block text-sm text-slate-700">
          密码
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" minLength={12} maxLength={128} autoComplete={registering ? 'new-password' : 'current-password'} required className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2" />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button disabled={submitting} className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-md py-2 text-sm font-medium">
          {submitting ? '处理中...' : registering ? '创建账号' : '登录'}
        </button>
        <button type="button" onClick={() => { setRegistering((value) => !value); setError(''); }} className="w-full text-sm text-blue-700">
          {registering ? '已有账号，去登录' : '没有账号，创建账号'}
        </button>
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
