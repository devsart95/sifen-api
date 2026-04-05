import type { PrismaClient } from '@prisma/client'
import { env } from '../../config/env.js'
import { derivarClave, encriptar, desencriptar } from './crypto.js'
import type { TenantCert, CertificateManager } from './types.js'

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutos

interface CacheEntry {
  cert: TenantCert
  expiresAt: number
}

/**
 * Gestiona certificados PKCS#12 por tenant.
 *
 * Cada certificado se encripta con AES-256-GCM antes de guardarse en DB.
 * La clave de cifrado se deriva del secreto maestro (API_KEY_SECRET) + tenantId
 * via HKDF-SHA256, garantizando aislamiento entre tenants.
 *
 * Jerarquía de fallback:
 *  1. Cache en memoria (TTL 5min)
 *  2. DB (cert encriptado)
 *  3. Variables de entorno SIFEN_CERT_PATH / SIFEN_CERT_PASS (backward compat)
 */
export class CertificateManagerImpl implements CertificateManager {
  private readonly cache = new Map<string, CacheEntry>()

  constructor(private readonly prisma: PrismaClient) {}

  async obtenerCert(tenantId: string): Promise<TenantCert> {
    // 1. Cache hit
    const cached = this.cache.get(tenantId)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.cert
    }

    // 2. DB
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        certEncriptado: true,
        certIv: true,
        certAuthTag: true,
        certPassEncriptado: true,
        certPassIv: true,
        certPassAuthTag: true,
        certExpiraEn: true,
      },
    })

    if (
      tenant?.certEncriptado &&
      tenant.certIv &&
      tenant.certAuthTag &&
      tenant.certPassEncriptado &&
      tenant.certPassIv &&
      tenant.certPassAuthTag
    ) {
      const clave = derivarClave(env.API_KEY_SECRET, tenantId)

      const p12Buffer = desencriptar(
        {
          iv: tenant.certIv,
          authTag: tenant.certAuthTag,
          data: tenant.certEncriptado as Buffer,
        },
        clave,
      )

      const passphrase = desencriptar(
        {
          iv: tenant.certPassIv,
          authTag: tenant.certPassAuthTag,
          data: Buffer.from(tenant.certPassEncriptado, 'hex'),
        },
        clave,
      ).toString('utf8')

      const cert: TenantCert = {
        p12Buffer,
        passphrase,
        expiraEn: tenant.certExpiraEn ?? undefined,
      }

      this.cache.set(tenantId, { cert, expiresAt: Date.now() + CACHE_TTL_MS })
      return cert
    }

    // 3. Fallback: certificado global desde env vars
    if (env.SIFEN_CERT_PATH && env.SIFEN_CERT_PASS) {
      const { readFileSync } = await import('node:fs')
      const p12Buffer = readFileSync(env.SIFEN_CERT_PATH)
      return { p12Buffer, passphrase: env.SIFEN_CERT_PASS }
    }

    throw new Error(`Tenant ${tenantId} no tiene certificado configurado y no hay cert global`)
  }

  async guardarCert(
    tenantId: string,
    p12Buffer: Buffer,
    passphrase: string,
    expiraEn?: Date,
  ): Promise<void> {
    const clave = derivarClave(env.API_KEY_SECRET, tenantId)

    const encCert = encriptar(p12Buffer, clave)
    const encPass = encriptar(Buffer.from(passphrase, 'utf8'), clave)

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        certEncriptado: encCert.data,
        certIv: encCert.iv,
        certAuthTag: encCert.authTag,
        certPassEncriptado: encPass.data.toString('hex'),
        certPassIv: encPass.iv,
        certPassAuthTag: encPass.authTag,
        certSubidoEn: new Date(),
        certExpiraEn: expiraEn,
      },
    })

    this.invalidarCache(tenantId)
  }

  invalidarCache(tenantId: string): void {
    this.cache.delete(tenantId)
  }
}
