import { useState, type FormEvent } from 'react';
import { ShieldCheck, Mail, LockKeyhole } from 'lucide-react';
import { safeJson } from '../utils/safeJson';
import { logoutSession, getSession } from '../utils/auth';

function AccountSecurityPanel() {
  const [challengeId, setChallengeId] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const requestCode = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/auth/change-password/request', { method: 'POST' });
      const data = await safeJson(response);
      if (!response.ok || data?._error) throw new Error(data?.message || '验证码发送失败');
      setChallengeId(data.challengeId); setMaskedEmail(data.maskedEmail); setMessage(`验证码已发送至 ${data.maskedEmail}。`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '验证码发送失败'); }
    finally { setBusy(false); }
  };

  const changePassword = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/auth/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword, newPassword, challengeId, code }) });
      const data = await safeJson(response);
      if (!response.ok || data?._error) throw new Error(data?.message || '密码修改失败');
      setMessage('密码已修改，所有设备都将退出登录。');
      setCurrentPassword(''); setNewPassword(''); setCode(''); setChallengeId('');
      await logoutSession();
    } catch (reason) { setError(reason instanceof Error ? reason.message : '密码修改失败'); }
    finally { setBusy(false); }
  };

  const email = getSession()?.email || '';
  return <div className="account-security-form">
    <h3 className="sr-only">账号安全</h3>
    <p className="mt-2 text-sm text-slate-600">当前验证邮箱：{email || '未读取到邮箱'}。修改密码需要当前密码和邮箱验证码。</p>
    {message && <p role="status" className="mt-3 text-sm text-emerald-700">{message}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    {!challengeId ? <button type="button" onClick={requestCode} disabled={busy} className="mt-4 rounded-md border border-blue-600 px-3 py-2 text-sm text-blue-700">{busy ? '处理中…' : '发送改密验证码'}</button> : <form onSubmit={changePassword} className="mt-4 grid max-w-xl gap-3">
      <p className="text-sm text-slate-600">验证码已发送至 {maskedEmail}。</p>
      <label className="text-sm">当前密码<input required minLength={12} maxLength={128} type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
      <label className="text-sm">新密码<input required minLength={12} maxLength={128} type="password" autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
      <label className="text-sm">邮箱验证码<input required pattern="[0-9]{6}" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
      <div className="flex gap-2"><button disabled={busy} className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white">{busy ? '处理中…' : '验证并修改密码'}</button><button type="button" disabled={busy} onClick={requestCode} className="rounded-md border px-3 py-2 text-sm">重新发送</button></div>
    </form>}
  </div>;
}


export function SettingsPage() {
  const session = getSession();
  return <div className="studio-page account-page">
    <header className="studio-page-heading"><p className="studio-eyebrow">个人空间</p><h1>账号设置</h1><p>管理登录信息。简历和目标岗位请前往「资料准备」。</p></header>
    <section className="studio-card account-summary"><span className="studio-icon"><ShieldCheck aria-hidden="true"/></span><div><h2>{session?.userId || '当前账号'}</h2><p><Mail size={15} aria-hidden="true"/>{session?.email || '邮箱状态未读取'}</p></div></section>
    <section className="studio-card account-security"><h2><LockKeyhole size={18} aria-hidden="true"/>登录与安全</h2><p>修改密码需要验证当前密码和邮箱。操作成功后，需要重新登录。</p>
      <details><summary>修改登录密码<span aria-hidden="true">＋</span></summary><AccountSecurityPanel/></details>
    </section>
  </div>;
}
