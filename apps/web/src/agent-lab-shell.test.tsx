import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LabShell } from '../../agent-lab/src/LabShell';
import { LAB_PAGES, labViewUrl, readLabView } from '../../agent-lab/src/lab-navigation';
import { useLabNavigation } from '../../agent-lab/src/useLabNavigation';

beforeEach(() => { window.history.replaceState(null, '', '/'); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });
const props = { view: 'overview' as const, onView: vi.fn(), locked: false, onAccount: vi.fn(), onLogout: vi.fn(async () => {}) };
it('keeps navigation and account actions available around a failed workspace', () => {
  render(<LabShell {...props}><div role="alert">当前页面读取失败</div></LabShell>);
  expect(screen.getByRole('alert')).toHaveTextContent('读取失败');
  expect(screen.getByRole('navigation', { name: 'Agent Lab 导航' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Trace' })).toBeEnabled();
  expect(screen.getByRole('button', { name: '控制中心' })).toHaveAttribute('aria-current', 'page');
  expect(screen.queryByRole('button', { name: '重新加载 MCP' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /账号安全/ }));
  expect(props.onAccount).toHaveBeenCalled();
});
it('supports disclosure navigation with Escape and focuses the new page heading', async () => {
  const result = render(<LabShell {...props}><p>内容</p></LabShell>);
  const toggle = screen.getByRole('button', { name: '打开导航' });
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  fireEvent.keyDown(toggle, { key: 'Escape' });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(toggle).toHaveFocus();
  result.rerender(<LabShell {...props} view="trace"><p>Trace 内容</p></LabShell>);
  expect(screen.getByRole('heading', { level: 1, name: 'Trace 运行记录' })).toHaveFocus();
  expect(document.title).toBe('Trace 运行记录 · Agent Lab');
});
it('blocks navigation during question processing without disabling the current page', () => {
  const onView = vi.fn();
  render(<LabShell {...props} view="question-bank" locked onView={onView}><p>处理中</p></LabShell>);
  fireEvent.click(screen.getByRole('button', { name: 'Trace' }));
  expect(onView).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: '题库治理' })).toBeEnabled();
});
it('disables duplicate logout while awaiting confirmation and restores retry after completion', async () => {
  let done!: () => void;
  const onLogout = vi.fn(() => new Promise<void>(resolve => { done = resolve; }));
  render(<LabShell {...props} onLogout={onLogout}><p>内容</p></LabShell>);
  fireEvent.click(screen.getByRole('button', { name: '退出控制台' }));
  expect(screen.getByRole('button', { name: '正在退出…' })).toBeDisabled();
  expect(onLogout).toHaveBeenCalledTimes(1);
  await act(async () => done());
  expect(screen.getByRole('button', { name: '退出控制台' })).toBeEnabled();
});
it('validates bookmarked views, keeps unrelated URL state and discards run selection outside Trace', () => {
  for (const view of Object.keys(LAB_PAGES)) expect(readLabView(`?view=${view}`)).toBe(view);
  for (const value of ['constructor', '__proto__', 'https://invalid.test', '<script>', '']) expect(readLabView(`?view=${value}`)).toBe('overview');
  expect(labViewUrl('trace', 'https://example.test/?source=demo#content')).toBe('/?source=demo&view=trace#content');
  expect(labViewUrl('data', 'https://example.test/?view=trace&run=run-1')).toBe('/?view=data');
});
it('restores bookmarked view and browser back, and refuses a pop navigation during processing', async () => {
  window.history.replaceState(null, '', '/?view=trace&run=run-1');
  const { result, rerender } = renderHook(({ locked }) => useLabNavigation(locked), { initialProps: { locked: false } });
  expect(result.current[0]).toBe('trace');
  act(() => result.current[1]('question-bank'));
  expect(window.location.search).toBe('?view=question-bank');
  rerender({ locked: true });
  act(() => result.current[1]('data'));
  expect(result.current[0]).toBe('question-bank');
  act(() => { window.history.replaceState(null, '', '/?view=trace'); window.dispatchEvent(new PopStateEvent('popstate')); });
  expect(window.location.search).toBe('?view=question-bank');
  expect(result.current[0]).toBe('question-bank');
  rerender({ locked: false });
  act(() => { window.history.replaceState(null, '', '/?view=trace'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await waitFor(() => expect(result.current[0]).toBe('trace'));
});
it('keeps unsaved work when page navigation is cancelled and permits explicit discard', () => {
  const ask = vi.spyOn(window, 'confirm').mockReturnValue(false);
  const { result } = renderHook(() => useLabNavigation(false, true));
  act(() => result.current[1]('runtime'));
  expect(result.current[0]).toBe('overview');
  ask.mockReturnValue(true);
  act(() => result.current[1]('runtime'));
  expect(result.current[0]).toBe('runtime');
  expect(window.location.search).toBe('?view=runtime');
});
it('canonicalizes accidental pasted prose paths while preserving the selected workspace', () => {
  expect(labViewUrl('runtime', 'http://localhost:5175/%EF%BC%89wrong-path?view=trace')).toBe('/?view=runtime');
});
