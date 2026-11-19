import { NavLink, Outlet } from 'react-router-dom';
import { Briefcase, FileText, ArrowRight } from 'lucide-react';

export function PreparationLayout() {
  return <div className="studio-page preparation-page">
    <header className="studio-page-heading"><p className="studio-eyebrow">PREPARE / 资料准备</p><h1>让面试更了解你</h1><p>保存个人经历，明确求职目标。准备好后，就可以开始有针对性的练习。</p></header>
    <nav className="preparation-tabs" aria-label="资料准备分类">
      <NavLink to="/prepare/resumes" className={({ isActive }) => isActive ? 'is-active' : ''}><FileText size={18} aria-hidden="true"/><span>我的简历<small>经历与技能</small></span></NavLink>
      <NavLink to="/prepare/jobs" className={({ isActive }) => isActive ? 'is-active' : ''}><Briefcase size={18} aria-hidden="true"/><span>目标岗位<small>岗位与职位描述</small></span></NavLink>
      <NavLink to="/practice" className="preparation-next">开始练习<ArrowRight size={16} aria-hidden="true"/></NavLink>
    </nav>
    <Outlet/>
  </div>;
}
