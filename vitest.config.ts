import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    exclude: ['tests/e2e/**'],
    // Setup global para mockear env antes de cualquier import de src/config/env.ts
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/server.ts',        // entry point, sin lógica testeable
        'src/app.ts',           // testeado vía integración, no unitario
        'src/**/*.d.ts',
      ],
      thresholds: {
        // Thresholds incrementales: se elevan a medida que se implementan módulos.
        // Valor inicial conservador — sube a 80 cuando todos los módulos estén cubiertos.
        lines: 60,
        functions: 60,
        branches: 55,
        statements: 60,
      },
    },
  },
})
