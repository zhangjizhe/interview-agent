import { Briefcase, ClipboardList, Dumbbell, Home, LogOut } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { clearSession, getSession } from '../utils/auth';

const navigation = [
  { to: '/', label: '首页', icon: Home, end: true },
  { to: '/interviews', label: '面试记录', icon: ClipboardList, end: false },
  { to: '/training', label: '训练', icon: Dumbbell, end: false },
  { to: '/settings', label: '岗位设置', icon: Briefcase, end: false },
];

export function AppShell() {
  const navigate = useNavigate();
  const session = getSession();

  const signOut = () => {
    clearSession();
    navigate('/', { replace: true });
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-4 md:px-6">
          <NavLink to="/" className="flex min-w-0 items-center gap-2">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-blue-600 text-sm font-bold text-white">
              面
            </div>
            <span className="truncate text-base font-semibold">小面</span>
          </NavLink>

          <nav aria-label="主导航" className="flex items-center gap-1">
            {navigation.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition ${
                    isActive
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`
                }
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">{label}</span>
              </NavLink>
            ))}
          </nav>

          <button
            type="button"
            onClick={signOut}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            title={`退出 ${session?.userId || '当前账号'}`}
            aria-label="退出登录"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
