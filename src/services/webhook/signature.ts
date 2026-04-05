import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookPayload } from './types.js'

/**
 * Genera la firma HMAC-SHA256 del payload del webhook.
 *
 * El receptor debe verificar comparando:
 *   X-Sifen-Signature == HMAC-SHA256(secret, JSON.stringify(payload))
 *
 * Formato del header: `sha256=<hex>`
 */
export function firmarPayload(payload: WebhookPayload, secret: string): string {
  const body = JSON.stringify(payload)
  const hmac = createHmac('sha256', secret).update(body).digest('hex')
  return `sha256=${hmac}`
}

/**
 * Verifica la firma de un webhook recibido.
 * Usa `timingSafeEqual` de node:crypto para comparación en tiempo constante real.
 * Las firmas HMAC-SHA256 tienen longitud fija (71 chars: "sha256=" + 64 hex).
 */
export function verificarFirma(
  payload: string,
  secret: string,
  signatureHeader: string,
): boolean {
  const expected = `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`
  // timingSafeEqual requiere Buffers del mismo length — padear si difieren para no revelar longitud
  const a = Buffer.from(expected)
  const b = Buffer.alloc(a.length)
  Buffer.from(signatureHeader).copy(b)
  return timingSafeEqual(a, b) && signatureHeader.length === expected.length
}
