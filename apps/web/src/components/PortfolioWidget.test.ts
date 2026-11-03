import { readFileSync } from 'node:fs';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const script = readFileSync('public/portfolio/assistant.js', 'utf8');
const uuid = '550e8400-e29b-41d4-a716-446655440000';
const reply = (value: any, status = 200) => new Response(JSON.stringify({ contractVersion: 'portfolio-assistant/v1', ...value }), { status });
const mount = () => { new Function(script)(); fireEvent.click(screen.getByRole('button', { name: '问问简历助手' })); };
const send = () => { fireEvent.change(screen.getByLabelText('你的问题'), { target: { value: '介绍你的 CTI 项目' } }); fireEvent.submit(document.querySelector('#portfolio-assistant form')!); };
beforeEach(() => { sessionStorage.clear(); vi.stubGlobal('crypto', { randomUUID: () => uuid }); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.replaceChildren(); document.getElementById('portfolio-assistant-style')?.remove(); });
describe('portable portfolio widget real source script', () => {
  it('renders refusal as text and does not poll or inject HTML', async () => {
    const fetcher = vi.fn().mockResolvedValue(reply({ status: 'REFUSED', answer: '<img src=x onerror=alert(1)>超出范围', sources: [] }));
    vi.stubGlobal('fetch', fetcher); mount(); send();
    await screen.findByText('<img src=x onerror=alert(1)>超出范围');
    expect(document.querySelector('#portfolio-assistant img')).toBeNull(); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('submits only message and key, then reads the signed ticket and safe source links', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(reply({ status: 'PENDING', ticket: 'signed-ticket' }, 202))
      .mockResolvedValue(reply({ status: 'COMPLETED', answer: '公开原文摘录', sourceRevision: 'v1', sources: [{ id: 'cti', title: 'CTI 项目', href: '#projects', quote: '公开原文摘录' }] }));
    vi.stubGlobal('fetch', fetcher); mount(); send();
    await screen.findByText('公开原文摘录');
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ message: '介绍你的 CTI 项目', requestKey: uuid });
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBeUndefined();
    expect(fetcher.mock.calls[1][0]).toBe('/api/portfolio-assistant/answers/signed-ticket');
    expect(screen.getByRole('link', { name: 'CTI 项目' })).toHaveAttribute('href', '#projects');
    expect(sessionStorage.getItem('portfolio-assistant-pending/v1')).toBeNull();
  });
  it('reuses the same admission key after an ambiguous receipt', async () => {
    const fetcher = vi.fn().mockResolvedValue(reply({ status: 'PENDING' }, 202));
    vi.stubGlobal('fetch', fetcher); mount(); send();
    await screen.findByText(/受理回执不完整/);
    fireEvent.submit(document.querySelector('#portfolio-assistant form')!);
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetcher.mock.calls[1][1].body).requestKey).toBe(uuid);
  });
  it('does not send a request when same-tab admission storage fails', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher); mount();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage blocked'); });
    send(); await screen.findByText(/本次未发送/); expect(fetcher).not.toHaveBeenCalled();
  });
  it('resumes a saved ticket using GET without automatically submitting again', async () => {
    sessionStorage.setItem('portfolio-assistant-pending/v1', JSON.stringify({ requestKey: uuid, ticket: 'saved-ticket' }));
    const fetcher = vi.fn().mockResolvedValue(reply({ status: 'FAILED' })); vi.stubGlobal('fetch', fetcher); mount();
    expect(fetcher).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '继续查看结果' }));
    await screen.findByText(/本次运行未完成/);
    expect(fetcher).toHaveBeenCalledTimes(1); expect(fetcher.mock.calls[0][0]).toContain('/answers/saved-ticket');
  });
});
