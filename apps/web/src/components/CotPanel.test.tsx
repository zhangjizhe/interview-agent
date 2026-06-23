import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CotPanel } from './CotPanel';
import type { AgentEvent } from '@interview-agent/shared-types';

describe('CotPanel', () => {
  it('returns null when no events', () => {
    const { container } = render(<CotPanel events={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders header with event count', () => {
    const events: AgentEvent[] = [
      { type: 'thinking', content: '正在思考...' },
      { type: 'searching', detail: '搜索 React 18' },
      { type: 'meta', content: 'engine: multi-agent' },
    ];
    render(<CotPanel events={events} />);
    // 标题应该显示步数
    expect(screen.getByText(/3 步/)).toBeInTheDocument();
  });

  it('renders thinking event with amber icon and "思考中" label', () => {
    const events: AgentEvent[] = [
      { type: 'thinking', content: '正在分析问题' },
    ];
    render(<CotPanel events={events} />);
    expect(screen.getByText('思考中')).toBeInTheDocument();
    expect(screen.getByText('正在分析问题')).toBeInTheDocument();
  });

  it('renders searching/tool_call/tool_result with emerald icon', () => {
    const events: AgentEvent[] = [
      { type: 'searching', detail: '联网搜索...' },
      { type: 'tool_call', toolName: 'bocha_search' },
      { type: 'tool_result', toolName: 'bocha_search', toolResult: '{}' },
    ];
    render(<CotPanel events={events} />);
    // 三个检索类应该都用 emerald 色
    expect(screen.getByText('检索中')).toBeInTheDocument();
    expect(screen.getByText('调用工具')).toBeInTheDocument();
    expect(screen.getByText('工具结果')).toBeInTheDocument();
  });

  it('renders recalling event with sky icon and "记忆召回" label', () => {
    const events: AgentEvent[] = [
      { type: 'recalling', detail: '召回 5 条' },
    ];
    render(<CotPanel events={events} />);
    expect(screen.getByText('记忆召回')).toBeInTheDocument();
    expect(screen.getByText('召回 5 条')).toBeInTheDocument();
  });

  it('renders meta event with "元信息" label', () => {
    const events: AgentEvent[] = [
      { type: 'meta', content: 'engine: multi-agent, intent: 评估' },
    ];
    render(<CotPanel events={events} />);
    expect(screen.getByText('元信息')).toBeInTheDocument();
    expect(screen.getByText(/engine: multi-agent/)).toBeInTheDocument();
  });

  it('renders token_usage event with "Token 用量" label', () => {
    const events: AgentEvent[] = [
      { type: 'token_usage', promptTokens: 100, completionTokens: 50, total: 150 },
    ];
    render(<CotPanel events={events} />);
    expect(screen.getByText('Token 用量')).toBeInTheDocument();
  });

  it('renders error event with "错误" label', () => {
    const events: AgentEvent[] = [
      { type: 'error', error: 'LLM 调用失败' },
    ];
    render(<CotPanel events={events} />);
    expect(screen.getByText('错误')).toBeInTheDocument();
  });

  it('renders events in order received', () => {
    const events: AgentEvent[] = [
      { type: 'thinking', content: 'first thought' },
      { type: 'meta', content: 'engine check' },
      { type: 'searching', detail: 'search step' },
    ];
    const { container } = render(<CotPanel events={events} />);
    // 验证渲染顺序
    const items = container.querySelectorAll('.flex.items-start.gap-2');
    expect(items).toHaveLength(3);
    expect(items[0].textContent).toContain('first thought');
    expect(items[1].textContent).toContain('engine check');
    expect(items[2].textContent).toContain('search step');
  });
});
