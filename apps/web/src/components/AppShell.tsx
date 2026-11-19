import { BookOpen, ClipboardList, Dumbbell, Home, LogOut, Play, Settings } from 'lucide-react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { getSession, logoutSession } from '../utils/auth';
import { useEffect, useRef, useState } from 'react';

const navigation = [
  { to: '/', label: '首页', icon: Home, end: true },
  { to: '/prepare', label: '资料准备', icon: BookOpen, end: false },
  { to: '/practice', label: '练习', icon: Play, end: false },
  { to: '/interviews', label: '面试记录', icon: ClipboardList, end: false },
  { to: '/training', label: '训练', icon: Dumbbell, end: false },
];

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const main = useRef<HTMLElement>(null);
  const previousPath = useRef(location.pathname);
  const label = location.pathname.startsWith('/prepare/jobs') ? '目标岗位' : location.pathname.startsWith('/prepare') ? '我的简历' : location.pathname === '/settings' ? '账号设置' : navigation.find(item => item.to === location.pathname)?.label || '面试评价';
  useEffect(() => {
    if (previousPath.current !== location.pathname) { main.current?.focus({ preventScroll: true }); previousPath.current = location.pathname; }
    document.title = `${label} · 小面训练`;
  }, [location.pathname, label]);
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
  return <div className="candidate-shell min-h-screen text-slate-900 md:grid md:grid-cols-[232px_1fr]">
    <a href="#candidate-main" className="candidate-skip-link">跳到主要内容</a>
    <aside className="candidate-sidebar hidden border-r border-slate-200 md:flex md:min-h-screen md:flex-col">
      <NavLink to="/" className="flex h-24 items-center gap-3 px-6"><span className="brand-mark grid h-10 w-10 place-items-center text-base font-bold text-white">面</span><span><span className="block text-base font-semibold">小面训练</span><span className="mt-0.5 block text-[10px] tracking-[0.16em] text-slate-500">INTERVIEW STUDIO</span></span></NavLink>
      <nav aria-label="候选人导航" className="flex-1 space-y-2 px-4 py-5"><p className="px-3 pb-3 text-[11px] font-semibold tracking-wider text-slate-500">我的训练空间</p>{navigation.map(({ to, label: text, icon: Icon, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => `candidate-nav flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium ${isActive ? 'is-active bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`}><Icon className="h-4 w-4" aria-hidden="true"/>{text}</NavLink>)}</nav>
      <div className="studio-sidebar-hint"><span aria-hidden="true">✦</span><p>从准备，到下一次进步。<small>让每一次面试都有积累。</small></p></div>
      <div className="studio-account-nav"><NavLink to="/settings" className={({ isActive }) => isActive ? 'is-active' : ''}><span className="studio-avatar" aria-hidden="true">{session?.userId?.slice(0, 1).toUpperCase() || '我'}</span><span><strong>{session?.userId || '个人空间'}</strong><small>账号设置</small></span><Settings size={16} aria-hidden="true"/></NavLink><button type="button" onClick={signOut} disabled={signingOut} className="studio-icon-button" aria-label={signingOut ? '正在退出' : '退出登录'}><LogOut size={17}/></button></div>
    </aside>
    <div className="min-w-0 pb-16 md:pb-0">
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 md:hidden"><NavLink to="/" className="flex items-center gap-2 font-semibold"><span className="brand-mark grid h-7 w-7 place-items-center text-sm text-white">面</span>小面训练</NavLink><div className="flex items-center gap-2"><NavLink to="/settings" aria-label="账号设置" className="studio-icon-button"><Settings size={19}/></NavLink>{location.pathname === '/settings' && <button type="button" onClick={signOut} disabled={signingOut} className="studio-icon-button" aria-label="退出登录"><LogOut size={19}/></button>}</div></header>
      <header className="candidate-topbar hidden h-16 items-center justify-between border-b border-slate-200 px-8 md:flex"><span className="text-xs text-slate-500">我的训练空间<span className="mx-3 text-slate-300">/</span><span className="text-slate-700">{label}</span></span><span className="studio-topbar-note">准备充分一点，表达从容一点。</span></header>
      <main ref={main} id="candidate-main" tabIndex={-1} className="candidate-main">{logoutError && <p role="alert" className="studio-notice danger">{logoutError}</p>}<Outlet/></main>
    </div>
    <nav aria-label="候选人移动导航" className="candidate-mobile-nav fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white px-1 md:hidden">{navigation.map(({ to, label: text, icon: Icon, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => `flex min-w-0 flex-col items-center justify-center gap-1 rounded-md text-[10px] font-medium ${isActive ? 'text-blue-700' : 'text-slate-500'}`}><Icon className="h-4 w-4" aria-hidden="true"/><span className="truncate">{text}</span></NavLink>)}</nav>
  </div>;
}
