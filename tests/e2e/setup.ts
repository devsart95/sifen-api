/**
 * Setup para tests E2E contra SIFEN homologación.
 * Requiere: SIFEN_CERT_PATH, SIFEN_CERT_PASS, DATABASE_URL, REDIS_URL
 * y SIFEN_AMBIENTE=test en el entorno.
 */
import { beforeAll } from 'vitest'

beforeAll(() => {
  const required = ['SIFEN_CERT_PATH', 'SIFEN_CERT_PASS', 'DATABASE_URL', 'API_KEY_SECRET']
  const missing = required.filter((key) => !process.env[key])

  if (missing.length > 0) {
    throw new Error(
      `Tests E2E requieren variables de entorno: ${missing.join(', ')}\n` +
      'Copiar .env.test.example a .env.test y completar con credenciales de homologación.'
    )
  }

  // Forzar ambiente de test
  process.env['SIFEN_AMBIENTE'] = 'test'
})
