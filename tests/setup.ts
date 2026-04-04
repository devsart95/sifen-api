/**
 * Setup global para todos los tests unitarios e integración.
 * Se ejecuta antes de cada archivo de test.
 *
 * Provee variables de entorno mínimas para que src/config/env.ts
 * no llame process.exit(1) al importarse en tests.
 */
import { beforeAll } from 'vitest'

beforeAll(() => {
  process.env['NODE_ENV'] ??= 'test'
  process.env['SIFEN_AMBIENTE'] ??= 'test'
  process.env['SIFEN_CERT_PATH'] ??= '/dev/null'
  process.env['SIFEN_CERT_PASS'] ??= 'test-placeholder'
  process.env['DATABASE_URL'] ??= 'postgresql://test:test@localhost:5432/test'
  process.env['REDIS_URL'] ??= 'redis://localhost:6379'
  process.env['API_KEY_SECRET'] ??= 'test-secret-32-chars-minimum-placeholder'
})
