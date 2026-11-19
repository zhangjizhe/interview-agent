import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Activity, BookOpen, Bot, ChevronRight, FlaskConical, Gauge, GitBranch, LogOut, Menu, ScrollText, Settings, ShieldAlert, SlidersHorizontal, Workflow, X } from 'lucide-react';
import { acquirePageScrollLock } from './page-scroll-lock';
import { LAB_PAGES, type LabView } from './lab-navigation';

const groups: Array<{ label: string; pages: Array<[LabView, typeof Bot]> }> = [
  { label: '工作空间', pages: [['overview', Gauge], ['runtime', Workflow], ['data', BookOpen], ['question-bank', BookOpen], ['mcp', SlidersHorizontal]] },
  { label: '运行与质量', pages: [['trace', GitBranch], ['evaluation', FlaskConical], ['evolution', Activity], ['experiments', Bot]] },
  { label: '发布与治理', pages: [['release', ShieldAlert], ['audit', ScrollText], ['operations', ScrollText]] },
];
export function LabShell({ view, onView, locked, onAccount, onLogout, actions, children }: {
  view: LabView; onView: (view: LabView) => void; locked: boolean;
  onAccount: () => void; onLogout: () => Promise<void>; actions?: ReactNode; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const navigation = useRef<HTMLElement>(null);
  const workarea = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const prior = useRef(view);
  const page = LAB_PAGES[view];
  useEffect(() => {
    document.title = `${page.title} · Agent Lab`;
    if (prior.current !== view) {
      setOpen(false);
      title.current?.focus();
      prior.current = view;
    }
  }, [view, page.title]);
  useEffect(() => {
    if (!open || typeof window.matchMedia !== 'function') return;
    const mobile = window.matchMedia('(max-width: 900px)');
    if (!mobile.matches) return;
    const releaseScroll = acquirePageScrollLock();
    workarea.current?.setAttribute('inert', '');
    const onResize = () => { if (!mobile.matches) setOpen(false); };
    mobile.addEventListener('change', onResize);
    return () => { releaseScroll(); workarea.current?.removeAttribute('inert'); mobile.removeEventListener('change', onResize); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); menuButton.current?.focus(); }
      if (event.key === 'Tab' && typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 900px)').matches) {
        const controls = [menuButton.current, ...Array.from(navigation.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])].filter((element): element is HTMLButtonElement => !!element && element.getClientRects().length > 0);
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  return <div className={`agent-shell lab-shell ${open ? 'nav-is-open' : ''}`}>
    <a className="lab-skip-link" href="#lab-main">跳到主要内容</a>
    <div className="lab-mobile-bar"><span className="lab-mobile-brand"><Bot size={18} aria-hidden="true"/>Agent Lab</span><button ref={menuButton} type="button" aria-controls="lab-navigation" aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? <X size={18}/> : <Menu size={18}/>}<span>{open ? '收起导航' : '打开导航'}</span></button></div>
    {open && <button type="button" tabIndex={-1} className="lab-nav-backdrop" aria-label="关闭工作空间导航" onClick={() => { setOpen(false); menuButton.current?.focus(); }}/>}
    <aside ref={navigation} className="agent-sidebar lab-navigation" id="lab-navigation">
      <div className="agent-brand"><Bot size={24} aria-hidden="true"/><div><span>Agent Lab</span><small>编排 · 运行 · 评测</small></div></div>
      <nav aria-label="Agent Lab 导航">{groups.map(group => <div className="lab-nav-group" key={group.label}><p className="agent-section-label">{group.label}</p>{group.pages.map(([id, Icon]) => <button type="button" key={id} className={`agent-nav-item ${view === id ? 'is-active' : ''}`} aria-current={view === id ? 'page' : undefined} disabled={locked && id !== view} title={locked && id !== view ? '当前操作正在处理，请等待结果后切换页面。' : undefined} onClick={() => { onView(id); setOpen(false); }}><Icon size={17} aria-hidden="true"/><span>{LAB_PAGES[id].label}</span>{view === id && <ChevronRight size={14} className="lab-nav-arrow" aria-hidden="true"/>}</button>)}</div>)}</nav>
      <div className="lab-sidebar-footer"><div className="lab-account"><span className="lab-avatar" aria-hidden="true">A</span><div><strong>管理员工作台</strong><small>受权限保护的控制面</small></div></div><button type="button" className="lab-account-command" onClick={() => { setOpen(false); onAccount(); }}><Settings size={16} aria-hidden="true"/>账号安全<span>修改密码</span></button><button type="button" className="agent-signout" disabled={signingOut} onClick={async () => { setSigningOut(true); try { await onLogout(); } finally { setSigningOut(false); } }}><LogOut size={16} aria-hidden="true"/>{signingOut ? '正在退出…' : '退出控制台'}</button></div>
    </aside>
    <div ref={workarea} className="lab-workarea"><div className="lab-context-bar"><span>工作台<ChevronRight size={13} aria-hidden="true"/><strong>{page.label}</strong></span><span className="lab-context-caption"><ShieldAlert size={14} aria-hidden="true"/>授权管理</span></div>
      <main className="agent-workspace" id="lab-main" tabIndex={-1}>
        <header className="agent-topbar"><div className="lab-page-heading"><h1 ref={title} tabIndex={-1}>{page.title}</h1><p>{page.description}</p></div>{actions && <div className="lab-page-actions">{actions}</div>}</header>
        <div className="lab-page-content">{children}</div>
      </main>
    </div>
  </div>;
}
