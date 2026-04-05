/**
 * Setup para tests E2E contra SIFEN homologación.
 *
 * Los tests E2E son condicionales: solo corren si SIFEN_E2E_CERT_PATH está definido.
 * Esto permite ejecutar la suite completa en CI sin certificado real.
 *
 * Para correr los tests E2E localmente:
 *   SIFEN_E2E_CERT_PATH=/path/cert.p12 SIFEN_E2E_CERT_PASS=pass pnpm test:e2e
 */
import { describe, it } from 'vitest'

export const E2E_HABILITADO =
  !!process.env['SIFEN_E2E_CERT_PATH'] && !!process.env['SIFEN_E2E_CERT_PASS']

/** Wrapper de `describe` que omite el bloque si los tests E2E están deshabilitados. */
export function describeE2e(name: string, fn: () => void) {
  if (E2E_HABILITADO) {
    describe(name, fn)
  } else {
    describe.skip(`[E2E OMITIDO — sin cert] ${name}`, fn)
  }
}

/** Wrapper de `it` que omite si E2E está deshabilitado. */
export function itE2e(name: string, fn: () => Promise<void>) {
  if (E2E_HABILITADO) {
    it(name, fn, 30_000)
  } else {
    it.skip(name, fn)
  }
}

export function getE2eConfig() {
  if (!E2E_HABILITADO) throw new Error('E2E no habilitado')
  return {
    certPath: process.env['SIFEN_E2E_CERT_PATH']!,
    certPass: process.env['SIFEN_E2E_CERT_PASS']!,
    ruc: process.env['SIFEN_E2E_RUC'] ?? '80069563',
    timbrado: process.env['SIFEN_E2E_TIMBRADO'] ?? '12345678',
  }
}
