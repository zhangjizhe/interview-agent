import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatBubble } from './ChatBubble';

describe('ChatBubble', () => {
  it('renders user message with right-aligned bubble', () => {
    const { container } = render(<ChatBubble role="user" content="hello" />);
    // user 消息应该有蓝色背景 + flex-row-reverse
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('flex-row-reverse');
    const bubble = screen.getByText('hello');
    expect(bubble.className).toContain('bg-blue-600');
    expect(bubble.className).toContain('text-white');
  });

  it('renders assistant message with left-aligned white bubble', () => {
    render(<ChatBubble role="assistant" content="hi there" />);
    const bubble = screen.getByText('hi there');
    expect(bubble.className).toContain('bg-white');
    expect(bubble.className).toContain('text-slate-900');
  });

  it('shows thinking placeholder when streaming and content empty', () => {
    render(<ChatBubble role="assistant" content="" streaming={true} />);
    // 应该显示 "思考中" 而不是空字符串
    expect(screen.getByText('思考中')).toBeInTheDocument();
  });

  it('shows streaming cursor when streaming and content present', () => {
    const { container } = render(<ChatBubble role="assistant" content="partial" streaming={true} />);
    // content 应该显示
    expect(screen.getByText('partial')).toBeInTheDocument();
    // cursor 应该存在（带 animate-pulse 类的 span）
    const cursor = container.querySelector('.animate-pulse');
    expect(cursor).not.toBeNull();
  });

  it('does not show cursor when not streaming', () => {
    const { container } = render(<ChatBubble role="assistant" content="done" streaming={false} />);
    const cursor = container.querySelector('.animate-pulse');
    expect(cursor).toBeNull();
  });

  it('does not show thinking placeholder when content exists', () => {
    render(<ChatBubble role="assistant" content="hello" streaming={true} />);
    // 不应显示 "思考中"，因为已经有内容
    expect(screen.queryByText('思考中')).toBeNull();
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  it('preserves whitespace and line breaks', () => {
    const multiline = 'line1\nline2\nline3';
    const { container } = render(<ChatBubble role="assistant" content={multiline} />);
    const bubble = container.querySelector('.whitespace-pre-wrap');
    expect(bubble).not.toBeNull();
    expect(bubble?.textContent).toBe(multiline);
  });
});
