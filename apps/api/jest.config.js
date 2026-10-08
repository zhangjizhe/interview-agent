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
    // 用 isolatedModules + 放宽 typecheck 让 spec 文件可被 ts-jest 编译
    // （原 tsconfig.json exclude 了 *.spec.ts + __tests__/**，导致 @jest/globals 等类型找不到）
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        ...require('./tsconfig.json').compilerOptions,
        types: ['node', 'jest'],
        noEmit: true,
      },
      isolatedModules: true,
      diagnostics: false,
    }],
  },
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',

  ],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.module.ts', '!src/main.ts'],
};
