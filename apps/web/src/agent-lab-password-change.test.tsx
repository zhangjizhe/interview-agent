import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AccountSecurityDialog } from '../../agent-lab/src/AccountSecurityDialog';

afterEach(() => vi.unstubAllGlobals());

it('Agent Lab password change requests a code for the verified mailbox before exposing the change form', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ challengeId: '11111111-1111-4111-8111-111111111111', maskedEmail: 'j***@example.test' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchMock);
  render(<AccountSecurityDialog onClose={() => undefined} />);

  expect(screen.getByRole('dialog', { name: '修改密码' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '发送邮箱验证码' }));
  expect(await screen.findByRole('status')).toHaveTextContent('验证码已发送至 j***@example.test。');
  expect(screen.getByLabelText('当前密码')).toBeInTheDocument();
  expect(screen.getByLabelText('新密码')).toBeInTheDocument();
  expect(screen.getByLabelText('邮箱验证码')).toHaveAttribute('autocomplete', 'one-time-code');
  expect(fetchMock).toHaveBeenCalledWith('/api/auth/change-password/request', { method: 'POST' });
});
