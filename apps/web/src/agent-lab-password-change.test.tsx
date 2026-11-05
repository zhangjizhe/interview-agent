import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AccountSecurityDialog } from '../../agent-lab/src/AccountSecurityDialog';

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

it('Agent Lab authenticates both password-change requests and retains the session on a retryable failure', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ challengeId: '11111111-1111-4111-8111-111111111111', maskedEmail: 'j***@example.test' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchMock);
  localStorage.setItem('ia_access_token', 'verified-test-session');
  render(<AccountSecurityDialog onClose={() => undefined} />);

  expect(screen.getByRole('dialog', { name: '修改密码' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '发送邮箱验证码' }));
  expect(await screen.findByRole('status')).toHaveTextContent('验证码已发送至 j***@example.test。');
  expect(screen.getByLabelText('当前密码')).toBeInTheDocument();
  expect(screen.getByLabelText('新密码')).toBeInTheDocument();
  expect(screen.getByLabelText('邮箱验证码')).toHaveAttribute('autocomplete', 'one-time-code');
  expect(fetchMock).toHaveBeenCalledWith('/api/auth/change-password/request', { method: 'POST', headers: expect.any(Headers) });
  const options = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
  expect(new Headers(options.headers).get('Authorization')).toBe('Bearer verified-test-session');
  fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ message: '暂时无法修改密码' }), { status: 503 }));
  fireEvent.change(screen.getByLabelText('当前密码'), { target: { value: 'current-password-123' } });
  fireEvent.change(screen.getByLabelText('新密码'), { target: { value: 'replacement-password-456' } });
  fireEvent.change(screen.getByLabelText('邮箱验证码'), { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: '验证并修改密码' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('暂时无法修改密码');
  const [path, changeOptions] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
  expect(path).toBe('/api/auth/change-password');
  expect(new Headers(changeOptions.headers).get('Authorization')).toBe('Bearer verified-test-session');
  expect(JSON.parse(String(changeOptions.body))).toMatchObject({ currentPassword: 'current-password-123', newPassword: 'replacement-password-456', code: '123456' });
  expect(localStorage.getItem('ia_access_token')).toBe('verified-test-session');
});
