import { useState, type FormEvent } from 'react';

export function AccountSecurityDialog({ onClose }: { onClose: () => void }) {
  const [challengeId, setChallengeId] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const requestCode = async () => {
    setPending(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/auth/change-password/request', { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || '验证码发送失败');
      setChallengeId(data.challengeId); setMaskedEmail(data.maskedEmail);
      setNotice(`验证码已发送至 ${data.maskedEmail}。`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '验证码发送失败'); }
    finally { setPending(false); }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setPending(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/auth/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword, newPassword, challengeId, code }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || '密码修改失败');
      sessionStorage.setItem('ia-password-changed', '1');
      localStorage.removeItem('ia_access_token'); localStorage.removeItem('ia_user_role'); localStorage.removeItem('ia_userId');
      window.location.reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : '密码修改失败'); }
    finally { setPending(false); }
  };

  return <div className="agent-security-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !pending) onClose(); }}>
    <section className="agent-security-dialog" role="dialog" aria-modal="true" aria-labelledby="agent-security-title">
      <button className="agent-command" type="button" onClick={onClose} disabled={pending}>关闭</button>
      <h2 id="agent-security-title">修改密码</h2>
      <p>需要当前密码和已验证邮箱验证码；修改后所有设备都将退出登录。</p>
      {notice && <p role="status">{notice}</p>}{error && <p className="agent-error" role="alert">{error}</p>}
      {!challengeId ? <button className="agent-command" type="button" onClick={requestCode} disabled={pending}>{pending ? '发送中…' : '发送邮箱验证码'}</button> : <form className="agent-security-form" onSubmit={submit}>
        <p>验证码已发送至 {maskedEmail}。</p>
        <label>当前密码<input type="password" minLength={12} maxLength={128} autoComplete="current-password" required value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} /></label>
        <label>新密码<input type="password" minLength={12} maxLength={128} autoComplete="new-password" required value={newPassword} onChange={event => setNewPassword(event.target.value)} /></label>
        <label>邮箱验证码<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} /></label>
        <button className="agent-command" disabled={pending}>{pending ? '处理中…' : '验证并修改密码'}</button>
        <button className="text-command" type="button" onClick={requestCode} disabled={pending}>重新发送验证码</button>
      </form>}
    </section>
  </div>;
}
