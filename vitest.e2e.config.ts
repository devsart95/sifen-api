import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/e2e/**/*.test.ts'],
    timeout: 60_000,  // SIFEN puede demorar
    testTimeout: 60_000,
    hookTimeout: 30_000,
    // E2E requiere variables de entorno reales y cert de homologación
    setupFiles: ['tests/e2e/setup.ts'],
  },
})
