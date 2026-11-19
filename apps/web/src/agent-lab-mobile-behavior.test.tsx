import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AccountSecurityDialog } from '../../agent-lab/src/AccountSecurityDialog';
import { LabShell } from '../../agent-lab/src/LabShell';
import { acquirePageScrollLock } from '../../agent-lab/src/page-scroll-lock';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.style.overflow = ''; });
const props = { view: 'overview' as const, onView: vi.fn(), locked: false, onAccount: vi.fn(), onLogout: vi.fn(async () => {}) };
function mobile() { vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })); }
it('keeps page scrolling locked while a navigation-to-dialog handoff overlaps', () => {
  document.body.style.overflow = 'clip';
  const navigation = acquirePageScrollLock(), dialog = acquirePageScrollLock();
  navigation(); navigation();
  expect(document.body.style.overflow).toBe('hidden');
  dialog();
  expect(document.body.style.overflow).toBe('clip');
});
it('opens a mobile navigation drawer without allowing interaction with the background, and restores it on close', () => {
  mobile();
  render(<LabShell {...props}><p>工作区内容</p></LabShell>);
  fireEvent.click(screen.getByRole('button', { name: '打开导航' }));
  expect(document.body.style.overflow).toBe('hidden');
  expect(document.querySelector('.lab-workarea')).toHaveAttribute('inert');
  fireEvent.click(screen.getByRole('button', { name: '关闭工作空间导航' }));
  expect(document.body.style.overflow).toBe('');
  expect(document.querySelector('.lab-workarea')).not.toHaveAttribute('inert');
  expect(screen.getByRole('button', { name: '打开导航' })).toHaveFocus();
});
it('closes navigation even when selecting the current page', () => {
  mobile();
  render(<LabShell {...props}><p>内容</p></LabShell>);
  fireEvent.click(screen.getByRole('button', { name: '打开导航' }));
  fireEvent.click(screen.getByRole('button', { name: '控制中心', exact: true }));
  expect(screen.getByRole('button', { name: '打开导航' })).toHaveAttribute('aria-expanded', 'false');
  expect(document.body.style.overflow).toBe('');
});
it('returns dialog focus and scrolling to the opener after Escape dismissal', () => {
  const close = vi.fn();
  const trigger = document.createElement('button'); document.body.append(trigger); trigger.focus();
  const result = render(<AccountSecurityDialog onClose={close}/>);
  expect(screen.getByRole('button', { name: '关闭', exact: true })).toHaveFocus();
  expect(document.body.style.overflow).toBe('hidden');
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(close).toHaveBeenCalledTimes(1);
  result.unmount();
  expect(trigger).toHaveFocus(); expect(document.body.style.overflow).toBe(''); trigger.remove();
});
it('follows the visible viewport when the keyboard reduces the dialog area', () => {
  const viewport = new EventTarget(); Object.assign(viewport, { height: 380, offsetTop: 20 });
  vi.stubGlobal('visualViewport', viewport);
  render(<AccountSecurityDialog onClose={vi.fn()}/>);
  const backdrop = document.querySelector<HTMLElement>('.agent-security-backdrop')!;
  expect(backdrop.style.getPropertyValue('--lab-visible-height')).toBe('380px');
  Object.assign(viewport, { height: 260, offsetTop: 40 });
  act(() => { viewport.dispatchEvent(new Event('resize')); });
  expect(backdrop.style.getPropertyValue('--lab-visible-height')).toBe('260px');
  expect(backdrop.style.getPropertyValue('--lab-visible-top')).toBe('40px');
});

it('portals the account dialog outside the inert shell during a mobile menu handoff', () => {
  mobile();
  function Harness() {
    const [open, setOpen] = useState(false);
    return <LabShell {...props} onAccount={() => setOpen(true)}>{open && <AccountSecurityDialog onClose={() => setOpen(false)}/>}</LabShell>;
  }
  render(<Harness/>);
  fireEvent.click(screen.getByRole('button', { name: '打开导航' }));
  const account = screen.getByRole('button', { name: /账号安全/ });
  account.focus(); // fireEvent.click alone does not model the browser's focus transfer.
  fireEvent.click(account);
  expect(screen.getByRole('dialog').closest('.lab-shell')).toBeNull();
  expect(document.querySelector('.lab-shell')).toHaveAttribute('inert');
  expect(document.body.style.overflow).toBe('hidden');
  fireEvent.click(screen.getByRole('button', { name: '关闭', exact: true }));
  expect(document.querySelector('.lab-shell')).not.toHaveAttribute('inert');
  expect(document.body.style.overflow).toBe('');
  expect(screen.getByRole('button', { name: '打开导航' })).toHaveFocus();
});

it('keeps a dialog usable in an embedded browser without visualViewport', () => {
  vi.stubGlobal('visualViewport', undefined);
  vi.stubGlobal('innerHeight', 760);
  const result = render(<AccountSecurityDialog onClose={vi.fn()}/>);
  const backdrop = document.querySelector<HTMLElement>('.agent-security-backdrop')!;
  expect(backdrop.style.getPropertyValue('--lab-visible-height')).toBe('760px');
  vi.stubGlobal('innerHeight', 300);
  act(() => { window.dispatchEvent(new Event('resize')); });
  expect(backdrop.style.getPropertyValue('--lab-visible-height')).toBe('300px');
  expect(backdrop.style.getPropertyValue('--lab-visible-top')).toBe('0px');
  result.unmount();
  vi.stubGlobal('innerHeight', 800);
  act(() => { window.dispatchEvent(new Event('resize')); });
  expect(backdrop.style.getPropertyValue('--lab-visible-height')).toBe('300px');
});
it('preserves the last valid dialog area during invalid viewport readings', () => {
  const viewport = new EventTarget(); Object.assign(viewport, { height: 300, offsetTop: 30 });
  vi.stubGlobal('visualViewport', viewport);
  render(<AccountSecurityDialog onClose={vi.fn()}/>);
  const backdrop = document.querySelector<HTMLElement>('.agent-security-backdrop')!;
  Object.assign(viewport, { height: 0, offsetTop: -10 });
  act(() => { viewport.dispatchEvent(new Event('resize')); });
  expect(backdrop.style.getPropertyValue('--lab-visible-height')).toBe('300px');
  Object.assign(viewport, { height: 280, offsetTop: -10 });
  act(() => { viewport.dispatchEvent(new Event('scroll')); });
  expect(backdrop.style.getPropertyValue('--lab-visible-height')).toBe('280px');
  expect(backdrop.style.getPropertyValue('--lab-visible-top')).toBe('0px');
});
