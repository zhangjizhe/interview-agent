/**
 * configuration.ts 单元测试 - parseSafeInt 严格整数解析 + assertValidUrl URL 验证
 *
 * 覆盖 P0-3 / R-P2-24 修复：
 *  - undefined → fallback
 *  - 空字符串 → fallback
 *  - '0' / 'NaN' / 负数 → fallback（原 `parseInt(s)||fallback` 把 0 当 falsy，但没把 NaN/负数显式排除）
 *  - '3001' → 3001
 *  - '128000' → 128000（验证大整数，不被 65535 端口上限截断——审查员 R-P2-24 第二轮反馈）
 *  - 'abc' → fallback
 *
 * 覆盖 P2 URL 验证 fail-fast（6-23 commit af2ac46）：
 *  - 商用模式（NODE_ENV=production）+ undefined → throw（不是静默 fallback）
 *  - 错协议（http:// 当 postgresql: 用）→ throw 明确错误消息
 *  - 完全不是 URL → throw 详细错误
 *  - dev/demo 模式 + undefined → 返回 undefined（不抛）
 *  - 多协议白名单（http/https）→ 任意一个都通过
 *
 * 设计原则：纯函数测试，无 mock / 无 DI / 无外部依赖
 */
import { parseSafeInt, configuration } from '../infra/config/configuration';

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

/**
 * assertValidUrl URL 验证 fail-fast 测试（6-23 commit af2ac46）
 *
 * 设计要点：
 * - 通过 configuration() 函数间接测（assertValidUrl 不 export）
 * - beforeEach / afterEach 保存恢复 env vars（避免污染其他测试）
 * - REPL 验证过实际行为后写 expected（避免 Test 预期陷阱）
 */
describe('assertValidUrl - URL fail-fast（通过 configuration() 间接测）', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    // 深拷贝 env vars，每个 case 独立
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    // 恢复原始 env
    process.env = ORIGINAL_ENV;
  });

  it('demo 模式 + 错协议 DATABASE_URL → throw 明确错误', () => {
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL = 'http://wrong-protocol';  // 应是 postgresql:
    expect(() => configuration()).toThrow(
      'DATABASE_URL protocol must be one of postgresql:/postgres:, got "http:"',
    );
  });

  it('商用模式 + undefined DATABASE_URL → throw fail-fast（不是静默 fallback）', () => {
    process.env.NODE_ENV = 'production';
    process.env.QWEN_API_KEY = 'test-key';  // 商用必须先满足 LLM API Key fail-fast
    delete process.env.DATABASE_URL;
    expect(() => configuration()).toThrow(
      'DATABASE_URL must be set in production (商用环境必填)',
    );
  });

  it('demo 模式 + undefined URL → 不抛，返回默认配置（fallback）', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.DATABASE_URL;
    delete process.env.REDIS_URL;
    delete process.env.QDRANT_URL;
    delete process.env.MILVUS_URL;
    // 不应抛，应该返回带默认值的配置对象（REPL 实测默认值）
    const config = configuration();
    expect(config.database.url).toBe('postgresql://dev:dev123@localhost:5432/interview');
    expect(config.redis.url).toBe('redis://localhost:6379');
    expect(config.qdrant.url).toBe('http://localhost:6333');
  });

  it('demo + 全部 URL 正常 → 返回对象，URL 透传', () => {
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL = 'postgresql://user:pass@host:5432/db';
    process.env.REDIS_URL = 'redis://redis-host:6379';
    process.env.QDRANT_URL = 'https://qdrant.example.com:6333';
    process.env.MILVUS_URL = 'http://milvus-host:19530';
    const config = configuration();
    expect(config.database.url).toBe('postgresql://user:pass@host:5432/db');
    expect(config.redis.url).toBe('redis://redis-host:6379');
    expect(config.qdrant.url).toBe('https://qdrant.example.com:6333');
  });

  it('demo + REDIS_URL 错协议 → throw 明确错误', () => {
    process.env.NODE_ENV = 'development';
    process.env.REDIS_URL = 'http://wrong';  // 应是 redis:
    expect(() => configuration()).toThrow(
      'REDIS_URL protocol must be one of redis:, got "http:"',
    );
  });

  it('demo + 完全不是 URL → throw 详细错误（含原值）', () => {
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL = 'not-a-url-at-all';
    expect(() => configuration()).toThrow(
      'DATABASE_URL is not a valid URL: not-a-url-at-all',
    );
  });

  it('demo + QDRANT_URL 用 https 多协议白名单 → 通过', () => {
    process.env.NODE_ENV = 'development';
    process.env.QDRANT_URL = 'https://qdrant.example.com:6333';  // http/https 都可
    // 不抛
    expect(() => configuration()).not.toThrow();
  });
});
