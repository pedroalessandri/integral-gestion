// ESLint flat config for apps/api
// Uses @gestion-publica/config-eslint as base + NestJS/TypeScript overrides.
// .mjs extension ensures this file is treated as ESM regardless of package.json type field.

import baseConfig from '@gestion-publica/config-eslint';

export default [
  ...baseConfig,
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    rules: {
      // NestJS relies heavily on parameter decorators; empty constructors are idiomatic.
      '@typescript-eslint/no-empty-function': 'off',
      // Decorators like @Body() can return `any`; allow in controllers/guards.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Allow unused parameters prefixed with _ (intentionally ignored, e.g. actingUserId reserved for audit wiring)
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
];
