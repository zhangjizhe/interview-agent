import { questionBankQuery } from '../../../agent-lab/src/question-bank-query';
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

 describe('question bank optional filters', () => {
  it.each(['', '   '])('omits an unset position for both list and search (%s)', position => {
    expect(new URLSearchParams(questionBankQuery(position, 50)).has('position')).toBe(false);
    const search = new URLSearchParams(questionBankQuery(position, 20, 'system design'));
    expect(search.has('position')).toBe(false);
    expect(search.get('q')).toBe('system design');
  });
  it('preserves encoded filter and query values', () => {
    const params = new URLSearchParams(questionBankQuery(' 前端 & Agent ', 20, 'A+B & C'));
    expect(params.get('position')).toBe('前端 & Agent');
    expect(params.get('q')).toBe('A+B & C');
  });
});
