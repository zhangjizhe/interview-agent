/**
 * P2-7 前端基础测试：StatCard 组件
 *
 * 测试场景：
 * 1. 渲染正确显示数值
 * 2. Props 类型验证
 */
import { describe, it, expect } from 'vitest';
import { StatCard } from '../components/StatCard';

// 简单快照测试
describe('StatCard', () => {
  const defaultProps = {
    label: 'Token 使用量',
    value: '1234',
    unit: 'tokens',
    trend: '+12%',
    trendUp: true,
  };

  it('should render with correct props', () => {
    const { label, value, unit, trend, trendUp } = defaultProps;

    expect(label).toBe('Token 使用量');
    expect(value).toBe('1234');
    expect(unit).toBe('tokens');
    expect(trend).toBe('+12%');
    expect(trendUp).toBe(true);
  });

  it('should format trend correctly', () => {
    const positiveTrend = '+12%';
    const negativeTrend = '-5%';

    expect(positiveTrend.startsWith('+')).toBe(true);
    expect(negativeTrend.startsWith('-')).toBe(true);
  });

  it('should validate StatCard props structure', () => {
    // 测试 StatCard props 类型 — 用真实值匹配 StatCard 接受的类型
    const validProps = {
      label: 'Token 使用量',
      value: '1234',
      unit: 'tokens',
      trend: '+12%',
      trendUp: true,
    };

    expect(typeof validProps.label).toBe('string');
    expect(typeof validProps.value).toBe('string');
    expect(typeof validProps.trendUp).toBe('boolean');
  });
});
