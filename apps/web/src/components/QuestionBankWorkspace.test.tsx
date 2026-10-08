import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuestionBankWorkspace } from '../../../agent-lab/src/QuestionBankWorkspace';

describe('Lab question bank governance', () => {
  let transport: any, clear: any;
  beforeEach(() => { clear = vi.fn(); transport = vi.fn(); vi.stubGlobal('fetch', transport); vi.spyOn(window, 'confirm').mockReturnValue(true); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  function mount() {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const question: any = { id: 'fixture', questionId: 'synthetic-question', position: 'Fixture', level: 'P5', category: 'Architecture', question: 'Synthetic question', tags: [] };
    return render(<QueryClientProvider client={client}><QuestionBankWorkspace questions={[question]} searchResults={[question]} query="fixture" position="" message="" onQuery={vi.fn()} onPosition={vi.fn()} onSearch={vi.fn()} onClearSearch={clear}/></QueryClientProvider>);
  }
  it('shows missing provenance honestly and clears old search after deletion', async () => {
    transport.mockResolvedValue(new Response('{"deleted":true}')); mount();
    expect(screen.getByText(/来源未记录/)).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('删除题目')); await waitFor(() => expect(clear).toHaveBeenCalledTimes(1));
    expect(transport.mock.calls[0][0]).toBe('/api/interview/question-bank/synthetic-question');
  });
  it.each([503, 200])('exposes deletion failure at HTTP %s without claiming success or discarding the current search', async status => {
    transport.mockResolvedValue(new Response('{"deleted":false}', { status })); mount();
    fireEvent.click(screen.getByTitle('删除题目')); await screen.findByRole('alert'); expect(clear).not.toHaveBeenCalled();
  });
});
