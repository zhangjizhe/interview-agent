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

it('verifies the mailbox before registration and again after password login', async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (path === '/api/auth/registration-code') return response({ challengeId: 'registration-challenge' });
    if (path === '/api/auth/register') {
      expect(body).toMatchObject({ userId: 'candidate-one', email: 'candidate@example.test', code: '123456' });
      return response({ userId: body.userId, email: body.email, created: true });
    }
    if (path === '/api/auth/login') {
      expect(body).toMatchObject({ userId: 'candidate-one', password: 'long-password-123' });
      return response({ requiresEmailVerification: true, challengeId: 'login-challenge', maskedEmail: 'c***@example.test' });
    }
    if (path === '/api/auth/login/verify-email') {
      expect(body).toMatchObject({ challengeId: 'login-challenge', code: '654321' });
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
  fireEvent.click(screen.getByRole('button', { name: '继续并发送验证码' }));
  expect(await screen.findByRole('heading', { name: '验证登录邮箱' })).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('验证码已发送至 c***@example.test。');
  fireEvent.change(screen.getByLabelText('邮箱验证码'), { target: { value: '654321' } });
  fireEvent.click(screen.getByRole('button', { name: '验证并登录' }));

  expect(await screen.findByTestId('protected-content')).toBeInTheDocument();
  expect(localStorage.getItem('ia_access_token')).toBe('verified-session');
  expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
    '/api/auth/registration-code',
    '/api/auth/register',
    '/api/auth/login',
    '/api/auth/login/verify-email',
  ]);
});

it('only completes password recovery after requesting and entering an email code', async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (path === '/api/auth/password-reset/request') {
      expect(body).toEqual({ userId: 'candidate-one' });
      return response({ accepted: true, challengeId: 'reset-challenge' });
    }
    if (path === '/api/auth/password-reset/complete') {
      expect(body).toMatchObject({ userId: 'candidate-one', challengeId: 'reset-challenge', code: '456789', newPassword: 'replacement-password-456' });
      return response({ success: true, mustLoginAgain: true });
    }
    throw new Error(`Unexpected auth request: ${path}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<AuthGate><div data-testid="protected-content">authenticated</div></AuthGate>);

  fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'candidate-one' } });
  fireEvent.click(screen.getByRole('button', { name: '忘记密码？' }));
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
