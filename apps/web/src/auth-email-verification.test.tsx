import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AuthGate } from './App';

const response = (body: unknown) => new Response(JSON.stringify(body), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
});

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('verifies registration then logs in with password without another email', async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (path.startsWith('/api/auth/check/')) return response({ available: true });
    if (path === '/api/auth/registration-code') return response({ challengeId: 'registration-challenge' });
    if (path === '/api/auth/register') {
      expect(body).toMatchObject({ userId: 'candidate-one', email: 'candidate@example.test', code: '123456' });
      return response({ userId: body.userId, email: body.email, created: true });
    }
    if (path === '/api/auth/login') {
      expect(body).toMatchObject({ userId: 'candidate-one', password: 'long-password-123' });
      return response({ accessToken: 'verified-session', userId: 'candidate-one', email: 'candidate@example.test', role: 'USER' });
    }
    throw new Error(`Unexpected auth request: ${path}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<AuthGate><div data-testid="protected-content">authenticated</div></AuthGate>);

  fireEvent.click(screen.getByRole('button', { name: '没有账号，创建账号' }));
  fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'candidate-one' } });
  fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'long-password-123' } });
  fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'candidate@example.test' } });
  fireEvent.click(screen.getByRole('button', { name: '发送邮箱验证码' }));
  expect(await screen.findByLabelText('邮箱验证码')).toBeInTheDocument();
  expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('邮箱验证码'), { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: '验证并创建账号' }));
  expect(await screen.findByRole('status')).toHaveTextContent('邮箱已验证，账号创建成功。');
  expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'long-password-123' } });
  fireEvent.click(screen.getByRole('button', { name: '登录' }));
  expect(await screen.findByTestId('protected-content')).toBeInTheDocument();
  expect(localStorage.getItem('ia_access_token')).toBe('verified-session');
  expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
    '/api/auth/check/candidate-one',
    '/api/auth/registration-code',
    '/api/auth/register',
    '/api/auth/login',
  ]);
});

it('only completes password recovery after requesting and entering an email code', async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (path === '/api/auth/password-reset/request') {
      expect(body).toEqual({ email: 'candidate@example.test' });
      return response({ accepted: true, challengeId: 'reset-challenge' });
    }
    if (path === '/api/auth/password-reset/complete') {
      expect(body).toMatchObject({ email: 'candidate@example.test', challengeId: 'reset-challenge', code: '456789', newPassword: 'replacement-password-456' });
      return response({ success: true, mustLoginAgain: true });
    }
    throw new Error(`Unexpected auth request: ${path}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<AuthGate><div data-testid="protected-content">authenticated</div></AuthGate>);

  fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'candidate-one' } });
  fireEvent.click(screen.getByRole('button', { name: '忘记密码？' }));
  fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'candidate@example.test' } });
  fireEvent.click(screen.getByRole('button', { name: '发送找回验证码' }));
  expect(await screen.findByLabelText('邮箱验证码')).toBeInTheDocument();
  expect(screen.getByLabelText('新密码')).toBeInTheDocument();
  expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('邮箱验证码'), { target: { value: '456789' } });
  fireEvent.change(screen.getByLabelText('新密码'), { target: { value: 'replacement-password-456' } });
  fireEvent.click(screen.getByRole('button', { name: '重置密码' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('密码已重置'));
  expect(screen.getByRole('heading', { name: '欢迎回来' })).toBeInTheDocument();
  expect(localStorage.getItem('ia_access_token')).toBeNull();
});


it('refuses an occupied registration username before requesting mail', async () => {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL) => response({ available: false, reason: '该 ID 已被占用，请返回登录' }));
  vi.stubGlobal('fetch', fetchMock);
  render(<AuthGate><div>protected</div></AuthGate>);
  fireEvent.click(screen.getByRole('button', { name: '没有账号，创建账号' }));
  fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'existing-user' } });
  fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'owner@example.test' } });
  fireEvent.click(screen.getByRole('button', { name: '发送邮箱验证码' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('已被占用');
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(String(fetchMock.mock.calls[0][0])).toBe('/api/auth/check/existing-user');
  expect(screen.queryByLabelText('邮箱验证码')).not.toBeInTheDocument();
});

it('keeps registration uncreated when actual mail delivery is unavailable', async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => String(input).includes('/check/')
    ? response({ available: true })
    : new Response(JSON.stringify({ message: '验证码邮件暂未发送成功，请稍后重试。' }), { status: 503 }));
  vi.stubGlobal('fetch', fetchMock);
  render(<AuthGate><div data-testid="protected-content">protected</div></AuthGate>);
  fireEvent.click(screen.getByRole('button', { name: '没有账号，创建账号' }));
  fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'new-user' } });
  fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'new@example.test' } });
  fireEvent.click(screen.getByRole('button', { name: '发送邮箱验证码' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('暂未发送成功');
  expect(screen.queryByLabelText('邮箱验证码')).not.toBeInTheDocument();
  expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  expect(localStorage.getItem('ia_access_token')).toBeNull();
});


it('keeps recovery on the email step when the server rejects the send limit', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: '验证码请求过于频繁，请稍后再试。' }), { status: 429 })));
  render(<AuthGate><div data-testid="protected-content">protected</div></AuthGate>);
  fireEvent.click(screen.getByRole('button', { name: '忘记密码？' }));
  fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'candidate@example.test' } });
  fireEvent.click(screen.getByRole('button', { name: '发送找回验证码' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('过于频繁');
  expect(screen.queryByLabelText('邮箱验证码')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('新密码')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '发送找回验证码' })).toBeEnabled();
});
