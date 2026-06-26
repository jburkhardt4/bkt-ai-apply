import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // `dist` is build output. `.agents` / `.claude` hold vendored agent-skill
  // tooling (e.g. the baoyu-design skill's own gen-pptx/gen-video sources) that
  // ships with its own conventions — it is not application source and must not
  // be linted by the app's ruleset (it only pollutes `eslint .`).
  globalIgnores(['dist', '.agents', '.claude']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },
  {
    // Node-run one-off scripts (e.g. scripts/rescore-stale.ts via `npx tsx`).
    // These run under Node, not the browser, so expose Node globals (process).
    files: ['scripts/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    // Playwright requires the test callback's first argument to be a destructuring
    // pattern; specs that use only `testInfo` need an empty one — `async ({}, testInfo)`.
    // Allow that empty *parameter* pattern (real empty destructurings still error).
    files: ['e2e/**/*.{ts,tsx}'],
    rules: {
      'no-empty-pattern': ['error', { allowObjectPatternsAsParameters: true }],
    },
  },
  {
    // The MV3 extension runs in browser + web-extension (chrome.*) + service-worker
    // contexts. tsc -b does not cover extension/ (it is bundled separately via
    // scripts/build-extension.mjs), so eslint is the type-adjacent gate here.
    files: ['extension/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.webextensions, ...globals.serviceworker },
    },
  },
])
