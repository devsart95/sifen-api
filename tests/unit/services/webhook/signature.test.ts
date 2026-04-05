/**
 * Tests para webhook/signature.ts — firmarPayload, verificarFirma, timingSafeEqual.
 */
import { describe, it, expect } from 'vitest'
import { firmarPayload, verificarFirma } from '../../../../src/services/webhook/signature.js'
import type { WebhookPayload } from '../../../../src/services/webhook/types.js'

// ── fixture ──────────────────────────────────────────────────────────────────

const PAYLOAD: WebhookPayload = {
  evento: 'de.aprobado',
  tenantId: 'tenant-uuid-123',
  timestamp: '2024-11-29T17:59:57.000Z',
  datos: { cdc: '01800695631001001010000001202411290100000000019', protocolo: '123456789', estado: 'APROBADO' },
}

const SECRET = 'mi-secreto-hmac-sha256'

// ──────────────────────────────────────────────────────────────
// firmarPayload
// ──────────────────────────────────────────────────────────────

describe('firmarPayload', () => {
  it('retorna string con prefijo "sha256="', () => {
    const firma = firmarPayload(PAYLOAD, SECRET)
    expect(firma.startsWith('sha256=')).toBe(true)
  })

  it('retorna 71 caracteres (7 del prefijo + 64 hex)', () => {
    const firma = firmarPayload(PAYLOAD, SECRET)
    expect(firma).toHaveLength(71)
  })

  it('la parte hex tiene 64 caracteres válidos', () => {
    const firma = firmarPayload(PAYLOAD, SECRET)
    const hex = firma.slice(7)
    expect(/^[0-9a-f]{64}$/.test(hex)).toBe(true)
  })

  it('el mismo payload + secret siempre produce la misma firma (determinismo)', () => {
    const firma1 = firmarPayload(PAYLOAD, SECRET)
    const firma2 = firmarPayload(PAYLOAD, SECRET)
    expect(firma1).toBe(firma2)
  })

  it('distintos secrets producen firmas distintas', () => {
    const firma1 = firmarPayload(PAYLOAD, 'secret-A')
    const firma2 = firmarPayload(PAYLOAD, 'secret-B')
    expect(firma1).not.toBe(firma2)
  })

  it('cambiar un campo del payload produce firma diferente', () => {
    const firmaOriginal = firmarPayload(PAYLOAD, SECRET)
    const payloadModificado = { ...PAYLOAD, tenantId: 'otro-tenant-uuid' }
    const firmaModificada = firmarPayload(payloadModificado, SECRET)
    expect(firmaOriginal).not.toBe(firmaModificada)
  })

  it('firma de payload mínimo no lanza error', () => {
    const payloadMinimo: WebhookPayload = {
      evento: 'de.aprobado',
      tenantId: '',
      timestamp: '',
      datos: {},
    }
    expect(() => firmarPayload(payloadMinimo, SECRET)).not.toThrow()
  })
})

// ──────────────────────────────────────────────────────────────
// verificarFirma
// ──────────────────────────────────────────────────────────────

describe('verificarFirma', () => {
  it('verifica correctamente una firma generada por firmarPayload', () => {
    const body = JSON.stringify(PAYLOAD)
    const firma = firmarPayload(PAYLOAD, SECRET)
    expect(verificarFirma(body, SECRET, firma)).toBe(true)
  })

  it('rechaza una firma con hex modificado en un carácter', () => {
    const body = JSON.stringify(PAYLOAD)
    const firma = firmarPayload(PAYLOAD, SECRET)
    // Flipar el último carácter hex
    const ultimo = firma[firma.length - 1]!
    const modificado = firma.slice(0, -1) + (ultimo === 'a' ? 'b' : 'a')
    expect(verificarFirma(body, SECRET, modificado)).toBe(false)
  })

  it('rechaza firma con secret incorrecto', () => {
    const body = JSON.stringify(PAYLOAD)
    const firma = firmarPayload(PAYLOAD, SECRET)
    expect(verificarFirma(body, 'wrong-secret', firma)).toBe(false)
  })

  it('rechaza firma generada con payload diferente al body recibido', () => {
    const bodyRecibido = JSON.stringify(PAYLOAD)
    const payloadAlterado = { ...PAYLOAD, cdc: 'cdc-alterado' }
    const firmaAlterada = firmarPayload(payloadAlterado, SECRET)
    // firma es del payload alterado, pero body es del original
    expect(verificarFirma(bodyRecibido, SECRET, firmaAlterada)).toBe(false)
  })

  it('rechaza string vacío como firma', () => {
    const body = JSON.stringify(PAYLOAD)
    expect(verificarFirma(body, SECRET, '')).toBe(false)
  })

  it('rechaza firma sin prefijo "sha256="', () => {
    const body = JSON.stringify(PAYLOAD)
    const firma = firmarPayload(PAYLOAD, SECRET)
    const sinPrefijo = firma.slice(7) // solo el hex sin "sha256="
    expect(verificarFirma(body, SECRET, sinPrefijo)).toBe(false)
  })

  it('rechaza firma con prefijo incorrecto (md5= en lugar de sha256=)', () => {
    const body = JSON.stringify(PAYLOAD)
    const firma = firmarPayload(PAYLOAD, SECRET)
    const conPrefijoCorrecto = firma
    const conPrefijoMalo = 'md5=' + firma.slice(7)
    // La firma válida pasa
    expect(verificarFirma(body, SECRET, conPrefijoCorrecto)).toBe(true)
    // La firma con prefijo malo falla (longitud diferente + contenido diferente)
    expect(verificarFirma(body, SECRET, conPrefijoMalo)).toBe(false)
  })

  // ── Propiedad de timingSafeEqual: mismo tiempo con firmas similares ─────────

  it('no lanza con firma de longitud diferente (padding protege contra length leak)', () => {
    const body = JSON.stringify(PAYLOAD)
    // Una firma más corta no debe causar excepción en timingSafeEqual
    expect(() => verificarFirma(body, SECRET, 'sha256=abc')).not.toThrow()
    expect(verificarFirma(body, SECRET, 'sha256=abc')).toBe(false)
  })

  it('no lanza con firma más larga que la esperada', () => {
    const body = JSON.stringify(PAYLOAD)
    const firmaLarga = firmarPayload(PAYLOAD, SECRET) + 'extra'
    expect(() => verificarFirma(body, SECRET, firmaLarga)).not.toThrow()
    expect(verificarFirma(body, SECRET, firmaLarga)).toBe(false)
  })

  // ── Consistencia firmar → verificar con JSON.stringify ────────────────────

  it('roundtrip completo: firmar payload y verificar el JSON.stringify del mismo payload', () => {
    const firma = firmarPayload(PAYLOAD, SECRET)
    // verificarFirma recibe el body como string (como llegaría en el request HTTP)
    const bodyString = JSON.stringify(PAYLOAD)
    expect(verificarFirma(bodyString, SECRET, firma)).toBe(true)
  })

  it('falla si el JSON fue re-serializado con orden diferente de claves', () => {
    // JSON.stringify no garantiza orden — si el receptor reordena las claves, la firma no coincide
    const firma = firmarPayload(PAYLOAD, SECRET)
    const payloadReordenado = {
      timestamp: PAYLOAD.timestamp,
      evento: PAYLOAD.evento,
      cdc: PAYLOAD.cdc,
      tenantId: PAYLOAD.tenantId,
      datos: PAYLOAD.datos,
    }
    const bodyReordenado = JSON.stringify(payloadReordenado)
    // Este caso puede o no fallar dependiendo del orden real — documentamos el comportamiento
    const bodyOriginal = JSON.stringify(PAYLOAD)
    if (bodyReordenado !== bodyOriginal) {
      expect(verificarFirma(bodyReordenado, SECRET, firma)).toBe(false)
    } else {
      // Si el orden es el mismo (coincidencia), pasa
      expect(verificarFirma(bodyReordenado, SECRET, firma)).toBe(true)
    }
  })
})
