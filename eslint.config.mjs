import parser from '@typescript-eslint/parser';

// 类型正确性交给 tsc；lint 检查可直接导致行为错误的语法模式，避免全库格式重写。
export default [{
  ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', '**/e2e/**', '**/migrations-archive/**'],
}, {
  files: ['apps/*/src/**/*.{ts,tsx}', 'packages/*/src/**/*.{ts,tsx}'],
  languageOptions: { parser, parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } } },
  rules: { 'no-debugger': 'error', 'no-dupe-args': 'error', 'no-dupe-else-if': 'error', 'no-duplicate-case': 'error', 'no-unreachable': 'error', 'valid-typeof': 'error' },
}];
