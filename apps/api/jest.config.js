module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.spec.ts',
    '<rootDir>/src/**/?(*.)+(spec|test).ts',
  ],
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    // P0-2 5 个 spec 文件暂存:基于早期设计稿,与实际实现不对齐(CacheService / getProviderStats / ContextManagerService / QuestionModel 等)
    // 等评审后基于真实实现重写。当前由 tests/cache.spec.ts (node:test) 与 src/__tests__/smoke.spec.ts 覆盖核心单测。
    'src/__tests__/llm-gateway.fallback.spec.ts',
    'src/__tests__/memory.dual-write.spec.ts',
    'src/__tests__/interview.sse.spec.ts',
    'src/__tests__/dynamic-task-queue.followup.spec.ts',
    'src/__tests__/context-manager.watermark.spec.ts',
    // vitest 编写的测试,需先 pnpm install vitest
    'src/modules/interview/knowledge-banks/index.test.ts',
  ],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.module.ts', '!src/main.ts'],
};
