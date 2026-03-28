import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import {
  sharedBrowserGlobals,
  sharedIgnores,
  sharedTsConfig,
} from '../eslint.config.mjs';

export default [
  ...sharedTsConfig,
  {
    ignores: sharedIgnores,
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: sharedBrowserGlobals,
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
];
