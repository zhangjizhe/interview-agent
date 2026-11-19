import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useVisibleViewport } from '../hooks/useVisibleViewport';

export function WorkflowDialog({ labelledBy, busy, onClose, children }: {
  labelledBy: string; busy: boolean; onClose: () => void; children: ReactNode;
}) {
  const backdrop = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const current = useRef({ busy, onClose }); current.current = { busy, onClose };
  useVisibleViewport(backdrop);
  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = document.getElementById('root');
    const wasInert = root?.hasAttribute('inert');
    const overflow = document.body.style.overflow;
    root?.setAttribute('inert', ''); document.body.style.overflow = 'hidden';
    panel.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); if (!current.current.busy) current.current.onClose(); }
      if (event.key === 'Tab') {
        const controls = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], summary, [tabindex]:not([tabindex="-1"])') ?? []).filter(element => !element.matches(':disabled') && element.tabIndex >= 0 && element.getClientRects().length);
        const first = controls[0], last = controls[controls.length - 1];
        if (!first) { event.preventDefault(); panel.current?.focus(); }
        else if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); document.body.style.overflow = overflow; if (!wasInert) root?.removeAttribute('inert'); if (trigger?.isConnected) trigger.focus(); };
  }, []);
  return createPortal(<div ref={backdrop} className="candidate-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div ref={panel} className="candidate-dialog" role="dialog" aria-modal="true" aria-labelledby={labelledBy} aria-busy={busy} tabIndex={-1}>{children}</div>
  </div>, document.body);
}
