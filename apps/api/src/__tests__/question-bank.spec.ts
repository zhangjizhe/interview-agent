/**
 * question-bank.service.ts 单元测试 - escapeMilvusString Milvus filter 转义
 *
 * 覆盖 P0-1 修复（审查员发现 SSRF/filter injection 风险）：
 *  - 反斜杠必须先转义（否则会双倍转义我们后加的引号转义）
 *  - 双引号必须转义（filter string 用 "..." 包裹）
 *  - 联合输入：反斜杠 + 引号（攻击场景 position == "\"; position == "x"）
 *  - 普通字符不转义
 *  - 数字 / Unicode 中文不变
 *
 * 设计原则：纯函数测试，零外部依赖
 */
import { escapeMilvusString } from '../modules/interview/services/escape-milvus.util';

describe('escapeMilvusString - Milvus filter 字符串转义', () => {
  it('普通字符串不变', () => {
    expect(escapeMilvusString('frontend')).toBe('frontend');
  });

  it('双引号 → \\\\"', () => {
    expect(escapeMilvusString('a"b')).toBe('a\\"b');
  });

  it('反斜杠 → \\\\\\\\（先转义反斜杠）', () => {
    expect(escapeMilvusString('a\\b')).toBe('a\\\\b');
  });

  it('反斜杠 + 双引号 联合（攻击场景：position == "\\"; position == "x"）', () => {
    // 原 `s.replace(/"/g, '\\"')` 不先转反斜杠会变成 "\\\\\\""（双重转义）
    // 修复后应先转反斜杠再转引号，输出 \\"（反斜杠转义后是 \\，引号转义后是 \"）
    expect(escapeMilvusString('\\"')).toBe('\\\\\\"');
  });

  it('数字 / ASCII 不变', () => {
    expect(escapeMilvusString('123')).toBe('123');
    expect(escapeMilvusString('hello world')).toBe('hello world');
  });

  it('Unicode 中文不变', () => {
    expect(escapeMilvusString('前端工程师')).toBe('前端工程师');
  });

  it('空字符串不变', () => {
    expect(escapeMilvusString('')).toBe('');
  });

  it('连续反斜杠 + 引号 混合', () => {
    // 输入 \\\\\" → 反斜杠转义 → \\\\\\\" → 引号转义 → \\\\\\\\\\"
    // 验证：每个 \ 变 \\，每个 " 变 \"
    expect(escapeMilvusString('\\\\"')).toBe('\\\\\\\\\\"');
  });
});
