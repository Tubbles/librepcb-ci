import { defineConfig } from 'vitest/config'

// Default environment is node. Front-end tests opt into jsdom per-file with the
// `// @vitest-environment jsdom` pragma at the top of the test file.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**', 'frontend/**'],
    },
  },
})
