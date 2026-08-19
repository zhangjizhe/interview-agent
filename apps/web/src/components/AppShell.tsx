import { Briefcase, ClipboardList, Dumbbell, Home, LogOut, PanelLeft } from 'lucide-react';
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
    <div className="min-h-screen bg-slate-50 text-slate-900 md:grid md:grid-cols-[220px_1fr]">
      <aside className="hidden border-r border-slate-200 bg-white md:flex md:min-h-screen md:flex-col">
        <NavLink to="/" className="flex h-16 items-center gap-2 border-b border-slate-200 px-5">
          <div className="grid h-8 w-8 place-items-center bg-blue-600 text-sm font-bold text-white">面</div>
          <span className="text-base font-semibold">小面训练</span>
        </NavLink>
        <nav aria-label="候选人导航" className="flex-1 space-y-1 p-3">
          {navigation.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => `flex h-10 items-center gap-3 px-3 text-sm font-medium ${isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`}><Icon className="h-4 w-4" aria-hidden="true" />{label}</NavLink>)}
        </nav>
        <button type="button" onClick={signOut} className="m-3 flex h-10 items-center gap-3 px-3 text-sm font-medium text-slate-600 hover:bg-slate-100" title={`退出 ${session?.userId || '当前账号'}`}><LogOut className="h-4 w-4" aria-hidden="true" />退出登录</button>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 md:hidden">
          <NavLink to="/" className="flex items-center gap-2 font-semibold"><PanelLeft className="h-4 w-4 text-blue-600" />小面训练</NavLink>
          <button type="button" onClick={signOut} className="inline-flex h-9 w-9 items-center justify-center text-slate-600" aria-label="退出登录"><LogOut className="h-4 w-4" /></button>
        </header>
        <main><Outlet /></main>
      </div>
    </div>
  );
}
