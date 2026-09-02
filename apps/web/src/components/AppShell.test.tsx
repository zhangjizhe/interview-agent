import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import { AppShell } from './AppShell';

vi.mock('../utils/auth', () => ({
  clearSession: vi.fn(),
  getSession: () => ({ userId: 'candidate-a', role: 'USER' }),
}));

describe('AppShell', () => {
  it('keeps candidate navigation focused on the training workflow', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<div>首页内容</div>} />
            <Route path="/training" element={<div>训练内容</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('navigation', { name: '候选人导航' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: '候选人移动导航' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: '首页' })).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: '训练' })).toHaveLength(2);
    expect(screen.queryByText('MCP 服务运行时状态')).not.toBeInTheDocument();
  });
});
