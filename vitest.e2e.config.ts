import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/e2e/**/*.test.ts'],
    testTimeout: 60_000,   // SIFEN puede demorar
    hookTimeout: 30_000,
    setupFiles: ['tests/e2e/setup.ts'],
  },
})
