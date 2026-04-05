/**
 * Tests críticos para crypto.ts — encriptación AES-256-GCM + HKDF-SHA256.
 * No dependen de DB ni red — todo local a node:crypto.
 */
import { describe, it, expect } from 'vitest'
import { derivarClave, encriptar, desencriptar, type PayloadEncriptado } from '../../../../src/services/certificate/crypto.js'

// ──────────────────────────────────────────────────────────────
// derivarClave
// ──────────────────────────────────────────────────────────────

describe('derivarClave', () => {
  it('devuelve un Buffer de 32 bytes (AES-256)', () => {
    const clave = derivarClave('master-secret-largo-suficiente-ok', 'tenant-abc')
    expect(clave).toBeInstanceOf(Buffer)
    expect(clave.byteLength).toBe(32)
  })

  it('el mismo masterSecret + tenantId siempre produce la misma clave (determinismo)', () => {
    const a = derivarClave('secret-maestro', 'tenant-xyz')
    const b = derivarClave('secret-maestro', 'tenant-xyz')
    expect(a.toString('hex')).toBe(b.toString('hex'))
  })

  it('diferentes tenantIds producen claves distintas (aislamiento)', () => {
    const a = derivarClave('secret-maestro', 'tenant-uno')
    const b = derivarClave('secret-maestro', 'tenant-dos')
    expect(a.toString('hex')).not.toBe(b.toString('hex'))
  })

  it('diferentes masterSecrets producen claves distintas', () => {
    const a = derivarClave('secret-A', 'tenant-xyz')
    const b = derivarClave('secret-B', 'tenant-xyz')
    expect(a.toString('hex')).not.toBe(b.toString('hex'))
  })

  it('cambiar un solo carácter del tenantId produce clave diferente', () => {
    const a = derivarClave('secret', 'tenant-1')
    const b = derivarClave('secret', 'tenant-2')
    expect(a.toString('hex')).not.toBe(b.toString('hex'))
  })
})

// ──────────────────────────────────────────────────────────────
// encriptar / desencriptar — roundtrip
// ──────────────────────────────────────────────────────────────

describe('encriptar', () => {
  it('devuelve iv de 12 bytes en hex (24 caracteres)', () => {
    const clave = derivarClave('secret', 'tenant-a')
    const { iv } = encriptar(Buffer.from('datos'), clave)
    expect(iv).toHaveLength(24)
    expect(/^[0-9a-f]+$/i.test(iv)).toBe(true)
  })

  it('devuelve authTag de 16 bytes en hex (32 caracteres)', () => {
    const clave = derivarClave('secret', 'tenant-a')
    const { authTag } = encriptar(Buffer.from('datos'), clave)
    expect(authTag).toHaveLength(32)
    expect(/^[0-9a-f]+$/i.test(authTag)).toBe(true)
  })

  it('dos encriptaciones del mismo plaintext producen ciphertexts distintos (IV aleatorio)', () => {
    const clave = derivarClave('secret', 'tenant-a')
    const plaintext = Buffer.from('mismo-mensaje')
    const enc1 = encriptar(plaintext, clave)
    const enc2 = encriptar(plaintext, clave)
    // Los IVs deben ser distintos (aleatoriedad)
    expect(enc1.iv).not.toBe(enc2.iv)
    // Los ciphertexts también serán distintos por el IV diferente
    expect(enc1.data.toString('hex')).not.toBe(enc2.data.toString('hex'))
  })

  it('el campo data es un Buffer (no string)', () => {
    const clave = derivarClave('secret', 'tenant-a')
    const { data } = encriptar(Buffer.from('test'), clave)
    expect(data).toBeInstanceOf(Buffer)
  })
})

describe('desencriptar', () => {
  it('roundtrip completo: encriptar → desencriptar recupera el plaintext exacto', () => {
    const clave = derivarClave('master-secret', 'tenant-roundtrip')
    const plaintext = Buffer.from('certificado-pkcs12-binario-simulado')
    const payload = encriptar(plaintext, clave)
    const recovered = desencriptar(payload, clave)
    expect(recovered.toString()).toBe(plaintext.toString())
  })

  it('roundtrip con contenido binario arbitrario (Buffer con bytes 0x00–0xFF)', () => {
    const clave = derivarClave('secret', 'tenant-bin')
    const plaintext = Buffer.from([0x00, 0x01, 0xFF, 0xFE, 0x80, 0x7F, 0x00])
    const payload = encriptar(plaintext, clave)
    const recovered = desencriptar(payload, clave)
    expect(recovered.equals(plaintext)).toBe(true)
  })

  it('roundtrip con buffer vacío', () => {
    const clave = derivarClave('secret', 'tenant-empty')
    const plaintext = Buffer.alloc(0)
    const payload = encriptar(plaintext, clave)
    const recovered = desencriptar(payload, clave)
    expect(recovered.length).toBe(0)
  })

  it('roundtrip con buffer grande (simulando P12 real ~4KB)', () => {
    const clave = derivarClave('secret', 'tenant-large')
    const plaintext = Buffer.alloc(4096, 0xAB)
    const payload = encriptar(plaintext, clave)
    const recovered = desencriptar(payload, clave)
    expect(recovered.equals(plaintext)).toBe(true)
  })

  it('lanza error si el authTag es incorrecto (integridad comprometida)', () => {
    const clave = derivarClave('secret', 'tenant-tamper')
    const plaintext = Buffer.from('datos sensibles')
    const payload = encriptar(plaintext, clave)

    const payloadTampered: PayloadEncriptado = {
      ...payload,
      // Mutar el authTag — 1 carácter diferente al principio
      authTag: 'ff' + payload.authTag.slice(2),
    }

    expect(() => desencriptar(payloadTampered, clave)).toThrow()
  })

  it('lanza error si el ciphertext es modificado (data corrompida)', () => {
    const clave = derivarClave('secret', 'tenant-corrupt')
    const plaintext = Buffer.from('datos importantes')
    const payload = encriptar(plaintext, clave)

    // Flipar el primer byte del ciphertext
    const dataTampered = Buffer.from(payload.data)
    dataTampered[0] = dataTampered[0] ^ 0xFF
    const payloadTampered: PayloadEncriptado = { ...payload, data: dataTampered }

    expect(() => desencriptar(payloadTampered, clave)).toThrow()
  })

  it('lanza error si se usa una clave de otro tenant (cross-tenant)', () => {
    const claveA = derivarClave('secret', 'tenant-A')
    const claveB = derivarClave('secret', 'tenant-B')
    const plaintext = Buffer.from('cert de tenant A')
    const payload = encriptar(plaintext, claveA)

    // Intentar desencriptar con clave de tenant B debe fallar
    expect(() => desencriptar(payload, claveB)).toThrow()
  })

  it('lanza error si el IV es modificado', () => {
    const clave = derivarClave('secret', 'tenant-iv')
    const plaintext = Buffer.from('datos')
    const payload = encriptar(plaintext, clave)

    const payloadBadIv: PayloadEncriptado = {
      ...payload,
      iv: 'ff' + payload.iv.slice(2), // IV diferente
    }

    expect(() => desencriptar(payloadBadIv, clave)).toThrow()
  })
})

// ──────────────────────────────────────────────────────────────
// Integración: derivarClave + encriptar + desencriptar
// ──────────────────────────────────────────────────────────────

describe('flujo completo derivarClave → encriptar → desencriptar', () => {
  it('simula guardar y recuperar un P12 de tenant', () => {
    const masterSecret = 'API_KEY_SECRET_largo_para_prueba_128bits'
    const tenantId = 'tenant-uuid-123'

    const clave = derivarClave(masterSecret, tenantId)
    const p12Simulado = Buffer.from('p12-binario-simulado-con-cert-y-key')
    const passphrase = 'mi-passphrase-secreta'

    const encCert = encriptar(p12Simulado, clave)
    const encPass = encriptar(Buffer.from(passphrase, 'utf8'), clave)

    // Simular almacenamiento en DB: cert como Buffer, pass como hex string
    const certAlmacenado: PayloadEncriptado = {
      iv: encCert.iv,
      authTag: encCert.authTag,
      data: encCert.data,
    }
    const passAlmacenado: PayloadEncriptado = {
      iv: encPass.iv,
      authTag: encPass.authTag,
      data: Buffer.from(encPass.data.toString('hex'), 'hex'), // simula round-trip hex
    }

    // Recuperación
    const claveRecuperada = derivarClave(masterSecret, tenantId)
    const p12Recuperado = desencriptar(certAlmacenado, claveRecuperada)
    const passphraseRecuperada = desencriptar(passAlmacenado, claveRecuperada).toString('utf8')

    expect(p12Recuperado.toString()).toBe(p12Simulado.toString())
    expect(passphraseRecuperada).toBe(passphrase)
  })
})
