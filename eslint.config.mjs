import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const baseIgnores = [
  '**/dist/**',
  '**/coverage/**',
  '**/node_modules/**',
  '**/.vite/**',
];

export const sharedTsConfig = tseslint.config(
  {
    ignores: baseIgnores,
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },
);

export const sharedBrowserGlobals = {
  ...globals.browser,
  ...globals.es2024,
};

export const sharedIgnores = baseIgnores;
