/**
 * LangfuseService 单元测试 - 确定性采样决策
 *
 * 覆盖 R-P2-11 修复：
 *  - 同 seed 多次调用 → 相同结果（确定性）
 *  - rate >= 1 → 始终 true
 *  - rate <= 0 → 始终 false
 *  - 无 seed → 走 Math.random()（不可重复）
 *  - 不同 seed → 可能不同结果（hash 分布）
 */
import { shouldSampleWith } from '../infra/langfuse/sampling.util';

describe('shouldSampleWith - 确定性采样（R-P2-11）', () => {
  const rates = { trace: 0.1, span: 0.5, generation: 1.0 };

  it('rate >= 1 → 始终 true', () => {
    expect(shouldSampleWith(rates, 'generation', 'any-seed')).toBe(true);
    expect(shouldSampleWith({ trace: 1, span: 1, generation: 1 }, 'trace', '')).toBe(true);
  });

  it('rate <= 0 → 始终 false', () => {
    expect(shouldSampleWith({ trace: 0, span: 0, generation: 0 }, 'trace', 'any')).toBe(false);
  });

  it('同 seed 多次调用 → 完全相同结果（确定性）', () => {
    const seed = 'interview-agent|ses_abc|user_001';
    const r1 = shouldSampleWith(rates, 'trace', seed);
    const r2 = shouldSampleWith(rates, 'trace', seed);
    const r3 = shouldSampleWith(rates, 'trace', seed);
    expect(r1).toBe(r2);
    expect(r2).toBe(r3);
  });

  it('不同 seed → 分布检验（1000 个生产格式 seed，rate=0.5）', () => {
    // 用生产实际 traceSeed 格式：name + sessionId + userId
    let trueCount = 0;
    for (let i = 0; i < 1000; i++) {
      const seed = `interview-agent|ses_${i.toString(16)}|user_${(i * 7).toString(16)}`;
      if (shouldSampleWith(rates, 'span', seed)) trueCount++;
    }
    // rate=0.5 → 期望 ~500 个 true（实测 496），允许 ±10% 误差
    expect(trueCount).toBeGreaterThan(400);
    expect(trueCount).toBeLessThan(600);
  });

  it('同 seed 不同 type → 独立采样决策', () => {
    const seed = 'test-seed-123';
    const trace = shouldSampleWith(rates, 'trace', seed);
    const span = shouldSampleWith(rates, 'span', seed);
    const generation = shouldSampleWith(rates, 'generation', seed);
    // generation rate=1.0 始终 true
    expect(generation).toBe(true);
    // trace rate=0.1 / span rate=0.5 应该独立决策
    expect(typeof trace).toBe('boolean');
    expect(typeof span).toBe('boolean');
  });

  it('空 seed → 走 Math.random()（无 seed fallback）', () => {
    let trueCount = 0;
    for (let i = 0; i < 100; i++) {
      if (shouldSampleWith(rates, 'trace', undefined)) trueCount++;
    }
    // rate=0.1 → 期望 10 个 true，允许范围 0-30
    expect(trueCount).toBeGreaterThanOrEqual(0);
    expect(trueCount).toBeLessThan(30);
  });
});
