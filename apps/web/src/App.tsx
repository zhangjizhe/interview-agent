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
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-white border border-slate-200 rounded-lg shadow-sm p-6 space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">小面</h1>
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
