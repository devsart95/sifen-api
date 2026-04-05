import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm' as const
const SALT = Buffer.from('sifen-api-cert-v1', 'utf8')

/**
 * Deriva una clave AES-256 por tenant usando HKDF-SHA256.
 * Cada tenant obtiene una clave distinta derivada del secreto maestro + tenantId.
 * Esto garantiza que comprometer una clave de tenant no compromete a los demás.
 */
export function derivarClave(masterSecret: string, tenantId: string): Buffer {
  const ikm = Buffer.from(masterSecret, 'utf8')
  const info = Buffer.from(`tenant-cert:${tenantId}`, 'utf8')
  const derivedKey = hkdfSync('sha256', ikm, SALT, info, 32)
  return Buffer.from(derivedKey)
}

export interface PayloadEncriptado {
  iv: string      // hex — 12 bytes = 24 chars
  authTag: string // hex — 16 bytes = 32 chars
  data: Buffer
}

/**
 * Encripta con AES-256-GCM. El authTag garantiza integridad y autenticidad.
 */
export function encriptar(plaintext: Buffer, clave: Buffer): PayloadEncriptado {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, clave, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return {
    iv: iv.toString('hex'),
    authTag: cipher.getAuthTag().toString('hex'),
    data: encrypted,
  }
}

/**
 * Desencripta con AES-256-GCM. Lanza si el authTag no coincide (datos corruptos o clave incorrecta).
 */
export function desencriptar(payload: PayloadEncriptado, clave: Buffer): Buffer {
  const decipher = createDecipheriv(ALGORITHM, clave, Buffer.from(payload.iv, 'hex'))
  decipher.setAuthTag(Buffer.from(payload.authTag, 'hex'))
  return Buffer.concat([decipher.update(payload.data), decipher.final()])
}
