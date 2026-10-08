import { Briefcase, ClipboardList, Dumbbell, Home, LogOut, PanelLeft, Play } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { getSession, logoutSession } from '../utils/auth';
import { useState } from 'react';

const navigation = [
  { to: '/', label: '首页', icon: Home, end: true },
  { to: '/practice', label: '练习', icon: Play, end: false },
  { to: '/interviews', label: '面试记录', icon: ClipboardList, end: false },
  { to: '/training', label: '训练', icon: Dumbbell, end: false },
  { to: '/settings', label: '岗位设置', icon: Briefcase, end: false },
];

export function AppShell() {
  const navigate = useNavigate();
  const session = getSession();
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true); setLogoutError('');
    try {
      if (await logoutSession()) { navigate('/', { replace: true }); window.location.reload(); }
    } catch (error) { setLogoutError(error instanceof Error ? error.message : '退出未确认，请重试。'); }
    finally { setSigningOut(false); }
  };

  return (
    <div className="candidate-shell min-h-screen text-slate-900 md:grid md:grid-cols-[248px_1fr]">
      <aside className="candidate-sidebar hidden border-r border-slate-200 md:flex md:min-h-screen md:flex-col">
        <NavLink to="/" className="flex h-24 items-center gap-3 px-6">
          <div className="brand-mark grid h-10 w-10 place-items-center text-base font-bold text-white">面</div>
          <span><span className="block text-base font-semibold tracking-normal">小面训练</span><span className="mt-0.5 block text-[10px] tracking-[0.16em] text-slate-500">INTERVIEW STUDIO</span></span>
        </NavLink>
        <nav aria-label="候选人导航" className="flex-1 space-y-2 px-4 py-5">
          <p className="px-3 pb-3 text-[11px] font-semibold tracking-wider text-slate-500">我的工作台</p>
          {navigation.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => `candidate-nav flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium ${isActive ? 'is-active bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`}><Icon className="h-4 w-4" aria-hidden="true" />{label}</NavLink>)}
        </nav>
        <div className="mx-5 mb-4 border-t border-slate-200 pt-5"><p className="text-xs font-medium text-slate-700">每一次练习，都有方向。</p><p className="mt-2 text-xs leading-5 text-slate-500">对齐目标岗位，积累评价证据，逐步补齐能力缺口。</p></div>
        <button type="button" onClick={signOut} disabled={signingOut} className="m-3 flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-slate-600 hover:bg-slate-100" title={`退出 ${session?.userId || '当前账号'}`}><LogOut className="h-4 w-4" aria-hidden="true" />{signingOut ? '正在退出' : '退出登录'}</button>
      </aside>
      <div className="min-w-0 pb-16 md:pb-0">
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 md:hidden">
          <NavLink to="/" className="flex items-center gap-2 font-semibold"><PanelLeft className="h-4 w-4 text-blue-600" />小面训练</NavLink>
          <button type="button" onClick={signOut} disabled={signingOut} className="inline-flex h-9 w-9 items-center justify-center text-slate-600" aria-label="退出登录"><LogOut className="h-4 w-4" /></button>
        </header>
        <header className="candidate-topbar hidden h-16 items-center justify-between border-b border-slate-200 px-8 md:flex"><span className="text-xs text-slate-500">个人工作台 <span className="mx-3 text-slate-300">/</span><span className="text-slate-700">面试与成长</span></span><span className="flex items-center gap-2 text-xs text-slate-600"><span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-full bg-blue-50 font-semibold text-blue-700">{session?.userId?.slice(0, 1).toUpperCase() || '我'}</span>个人空间</span></header>
        <main className="candidate-main">{logoutError && <p role="alert" className="px-6 py-3 text-sm text-red-700">{logoutError}</p>}<Outlet /></main>
      </div>
      <nav aria-label="候选人移动导航" className="candidate-mobile-nav fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white px-1 md:hidden">
        {navigation.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => `flex min-w-0 flex-col items-center justify-center gap-1 rounded-md text-[10px] font-medium ${isActive ? 'text-blue-700' : 'text-slate-500'}`}><Icon className="h-4 w-4" aria-hidden="true" /><span className="truncate">{label}</span></NavLink>)}
      </nav>
    </div>
  );
}
