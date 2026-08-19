import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  // public/ holds vendored MediaPipe wasm glue — not ours to lint.
  { ignores: ['dist', 'node_modules', 'coverage', 'public'] },

  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },


  js.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.worker },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'inline-type-imports' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
    },
  },

  // React rules apply to the UI layer only.
  {
    files: ['src/ui/**/*.tsx', 'src/app/**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },

  // ARCHITECTURAL GATE (docs/PLAN.md §3, DECISIONS.md D2):
  // the engine must stay framework-agnostic so it can be lifted into any shell.
  {
    files: ['src/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'react/*', 'motion', 'motion/*', 'zustand', '@/ui/*'],
              message:
                'src/engine must not depend on the UI layer or any framework. See docs/PLAN.md §3.',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['**/*.test.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
);
