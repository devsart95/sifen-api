export interface TenantCert {
  p12Buffer: Buffer
  passphrase: string
  expiraEn?: Date
}

export interface CertificateManager {
  /** Obtiene el certificado del tenant (DB → fallback env vars). Cachea 5 min. */
  obtenerCert(tenantId: string): Promise<TenantCert>
  /** Encripta y guarda el certificado del tenant en DB. Invalida cache. */
  guardarCert(tenantId: string, p12Buffer: Buffer, passphrase: string, expiraEn?: Date): Promise<void>
  /** Fuerza reload del certificado en el próximo `obtenerCert`. */
  invalidarCache(tenantId: string): void
}
