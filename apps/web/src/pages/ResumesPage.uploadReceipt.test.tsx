import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ResumesPage } from './ResumesPage';
vi.mock('../utils/auth', () => ({ getSession: () => ({ userId: 'synthetic-owner' }) }));
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
afterEach(() => { sessionStorage.clear(); vi.unstubAllGlobals(); });

it.each([
  ['empty', 201, {}], ['false', 201, { ragIngested: false }], ['string', 201, { ragIngested: 'true' }],
  ['refused with forged flag', 503, { ragIngested: true, message: 'Synthetic unavailable' }],
  ['confirmed', 201, { ragIngested: true }],
])('requires an explicit successful upload receipt: %s', async (_label, status, receipt) => {
  let uploads = 0;
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    if (init?.method === 'POST') { uploads++; return json(receipt, status); }
    if (String(url).endsWith('/target-jobs')) return json([{ id: 'job', title: 'Synthetic role', isActive: true, profileVersion: 1 }]);
    if (String(url).includes('/resumes/')) return json({ resumes: uploads && status < 400 && receipt.ragIngested === true ? [{ name: 'Synthetic candidate' }] : [] });
    if (String(url).includes('/readiness')) return json(null);
    return json([]);
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><MemoryRouter><ResumesPage /></MemoryRouter></QueryClientProvider>);
  try {
    await screen.findByRole('heading', { name: '上传简历' });
    const input = view.container.querySelector('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [new File(['Synthetic candidate\nTypeScript'], 'synthetic.txt', { type: 'text/plain' })] } });
    await waitFor(() => expect(screen.getByRole('button', { name: '上传并解析' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '上传并解析' }));
    if (status < 400 && receipt.ragIngested === true) expect(await screen.findByText(/简历已解析并保存到个人简历库/)).toHaveAttribute('role', 'status');
    else {
      expect(await screen.findByRole('alert')).toHaveTextContent(status >= 400 ? 'Synthetic unavailable' : '未确认保存结果');
      expect(screen.queryByText(/简历已解析并保存到个人简历库/)).toBeNull();
      expect(screen.getByRole('status', { name: '所选简历' })).toHaveTextContent('保存结果待核对');
    }
    await waitFor(() => expect(uploads).toBe(1));
  } finally { view.unmount(); client.clear(); }
});
