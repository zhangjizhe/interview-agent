import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { acquirePageScrollLock } from './page-scroll-lock';
import { api } from './api';

export function AccountSecurityDialog({ onClose }: { onClose: () => void }) {
  const backdrop = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const pendingRef = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [challengeId, setChallengeId] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  pendingRef.current = pending;
  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const releaseScroll = acquirePageScrollLock();
    const root = document.querySelector('.lab-shell');
    const wasInert = root?.hasAttribute('inert');
    root?.setAttribute('inert', '');
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pendingRef.current) { event.preventDefault(); closeRef.current(); }
      if (event.key === 'Tab') {
        const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') ?? []).filter(element => element.getClientRects().length > 0);
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    const viewport = window.visualViewport;
    const fitVisibleViewport = () => {
      // Embedded browsers may expose only window resize. Keep the dialog usable
      // there too; transient invalid viewport readings must not collapse it.
      const height = viewport?.height ?? window.innerHeight;
      if (!Number.isFinite(height) || height <= 0) return;
      const offsetTop = viewport?.offsetTop ?? 0;
      backdrop.current?.style.setProperty('--lab-visible-height', `${height}px`);
      backdrop.current?.style.setProperty('--lab-visible-top', `${Number.isFinite(offsetTop) ? Math.max(0, offsetTop) : 0}px`);
    };
    fitVisibleViewport();
    viewport?.addEventListener('resize', fitVisibleViewport);
    viewport?.addEventListener('scroll', fitVisibleViewport);
    window.addEventListener('resize', fitVisibleViewport);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      releaseScroll();
      viewport?.removeEventListener('resize', fitVisibleViewport);
      viewport?.removeEventListener('scroll', fitVisibleViewport);
      window.removeEventListener('resize', fitVisibleViewport);
      if (!wasInert) root?.removeAttribute('inert');
      if (trigger?.closest('.lab-navigation') && typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 900px)').matches) root?.querySelector<HTMLButtonElement>('button[aria-controls=lab-navigation]')?.focus();
      else if (trigger?.isConnected) trigger.focus();
    };
  }, []);

  const requestCode = async () => {
    setPending(true); setError(''); setNotice('');
    try {
      const data = await api('/auth/change-password/request', { method: 'POST' });
      setChallengeId(data.challengeId); setMaskedEmail(data.maskedEmail);
      setNotice(`验证码已发送至 ${data.maskedEmail}。`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '验证码发送失败'); }
    finally { setPending(false); }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setPending(true); setError(''); setNotice('');
    try {
      await api('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword, challengeId, code }) });
      sessionStorage.setItem('ia-password-changed', '1');
      localStorage.removeItem('ia_access_token'); localStorage.removeItem('ia_user_role'); localStorage.removeItem('ia_userId');
      window.location.reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : '密码修改失败'); }
    finally { setPending(false); }
  };

  return createPortal(<div ref={backdrop} className="agent-security-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !pending) onClose(); }}>
    <section ref={dialog} className="agent-security-dialog" role="dialog" aria-modal="true" aria-labelledby="agent-security-title">
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
  </div>, document.body);
}
