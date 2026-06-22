/**
 * configuration.ts 单元测试 - parseSafeInt 严格整数解析
 *
 * 覆盖 P0-3 / R-P2-24 修复：
 *  - undefined → fallback
 *  - 空字符串 → fallback
 *  - '0' / 'NaN' / 负数 → fallback（原 `parseInt(s)||fallback` 把 0 当 falsy，但没把 NaN/负数显式排除）
 *  - '3001' → 3001
 *  - '128000' → 128000（验证大整数，不被 65535 端口上限截断——审查员 R-P2-24 第二轮反馈）
 *  - 'abc' → fallback
 *
 * 设计原则：纯函数测试，无 mock / 无 DI / 无外部依赖
 */
import { parseSafeInt } from '../infra/config/configuration';

describe('parseSafeInt - 严格整数解析', () => {
  it('undefined → fallback', () => {
    expect(parseSafeInt(undefined, 3001)).toBe(3001);
  });

  it('空字符串 → fallback', () => {
    expect(parseSafeInt('', 3001)).toBe(3001);
  });

  it('"0" → fallback（原 parseInt||fallback 巧合覆盖，但需显式测试）', () => {
    expect(parseSafeInt('0', 3001)).toBe(3001);
  });

  it('"-1" → fallback（负数不合法）', () => {
    expect(parseSafeInt('-1', 3001)).toBe(3001);
  });

  it('"abc" → fallback（NaN）', () => {
    expect(parseSafeInt('abc', 3001)).toBe(3001);
  });

  it('"3001" → 3001（正常整数）', () => {
    expect(parseSafeInt('3001', 9999)).toBe(3001);
  });

  it('"128000" → 128000（大整数，验证移除 65535 上限，审查员 R-P2-24 第二轮反馈）', () => {
    // 原实现 `n <= 65535` 会让 maxTokens=200000 静默 fallback；现应原样返回
    expect(parseSafeInt('128000', 32000)).toBe(128000);
    expect(parseSafeInt('200000', 32000)).toBe(200000);
  });
});
