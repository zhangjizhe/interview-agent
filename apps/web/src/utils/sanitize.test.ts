import { describe, it, expect } from 'vitest';
import { escapeHtml, sanitizeHtml } from '../utils/sanitize';

describe('escapeHtml', () => {
  it('转义 HTML 特殊字符', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
    );
  });

  it('转义 & 符号', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('转义单引号', () => {
    expect(escapeHtml("it's")).toBe('it&#x27;s');
  });

  it('纯文本不变', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });
});

describe('sanitizeHtml', () => {
  it('纯文本直接返回', () => {
    expect(sanitizeHtml('hello world')).toBe('hello world');
  });

  it('移除 script 标签但保留内容', () => {
    const result = sanitizeHtml('<script>alert(1)</script>hello');
    expect(result).not.toContain('<script');
    expect(result).toContain('hello');
  });

  it('保留白名单标签', () => {
    const result = sanitizeHtml('<b>bold</b> and <i>italic</i>');
    expect(result).toContain('<b>bold</b>');
    expect(result).toContain('<i>italic</i>');
  });

  it('移除危险属性', () => {
    const result = sanitizeHtml('<p onclick="alert(1)">text</p>');
    expect(result).not.toContain('onclick');
  });

  it('移除 javascript: 协议', () => {
    const result = sanitizeHtml('<a href="javascript:alert(1)">link</a>');
    expect(result).not.toContain('javascript:');
  });
});
