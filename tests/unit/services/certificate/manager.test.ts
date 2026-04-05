/**
 * Tests para CertificateManagerImpl — cache TTL, fallback env, errores.
 * Prisma mockeado con vi.fn() para no requerir DB.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CertificateManagerImpl } from '../../../../src/services/certificate/manager.js'
import { derivarClave, encriptar } from '../../../../src/services/certificate/crypto.js'

// ── helpers ─────────────────────────────────────────────────────────────────

function makePrismaMock() {
  return {
    tenant: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  }
}

/**
 * Genera un payload encriptado serializado como lo haría la DB.
 * El cert queda como Buffer, la pass como hex string.
 */
function buildEncryptedTenantRow(masterSecret: string, tenantId: string) {
  const clave = derivarClave(masterSecret, tenantId)
  const p12 = Buffer.from('p12-simulado')
  const pass = Buffer.from('passphrase-test', 'utf8')

  const encCert = encriptar(p12, clave)
  const encPass = encriptar(pass, clave)

  return {
    certEncriptado: encCert.data,
    certIv: encCert.iv,
    certAuthTag: encCert.authTag,
    certPassEncriptado: encPass.data.toString('hex'),
    certPassIv: encPass.iv,
    certPassAuthTag: encPass.authTag,
    certExpiraEn: null,
  }
}

// ── suite ────────────────────────────────────────────────────────────────────

describe('CertificateManagerImpl', () => {
  const MASTER_SECRET = 'test-secret-32-chars-minimum-placeholder'
  const TENANT_ID = 'tenant-test-uuid'

  beforeEach(() => {
    // Garantizar que las vars de entorno estén seteadas (el setup.ts lo hace globalmente)
    process.env['API_KEY_SECRET'] = MASTER_SECRET
    process.env['SIFEN_CERT_PATH'] = ''
    process.env['SIFEN_CERT_PASS'] = ''
  })

  // ── obtenerCert desde DB ───────────────────────────────────────────────────

  it('obtiene cert desde DB cuando existen datos encriptados', async () => {
    const prisma = makePrismaMock()
    const row = buildEncryptedTenantRow(MASTER_SECRET, TENANT_ID)
    prisma.tenant.findUnique.mockResolvedValue(row)

    const manager = new CertificateManagerImpl(prisma as any)
    const cert = await manager.obtenerCert(TENANT_ID)

    expect(cert.p12Buffer.toString()).toBe('p12-simulado')
    expect(cert.passphrase).toBe('passphrase-test')
  })

  it('popula la cache en el primer acceso a DB', async () => {
    const prisma = makePrismaMock()
    const row = buildEncryptedTenantRow(MASTER_SECRET, TENANT_ID)
    prisma.tenant.findUnique.mockResolvedValue(row)

    const manager = new CertificateManagerImpl(prisma as any)

    // Primera llamada: va a DB
    await manager.obtenerCert(TENANT_ID)
    // Segunda llamada: debe servirse del cache (findUnique llamado solo 1 vez)
    await manager.obtenerCert(TENANT_ID)

    expect(prisma.tenant.findUnique).toHaveBeenCalledTimes(1)
  })

  it('invalida la cache y vuelve a ir a DB después de invalidarCache', async () => {
    const prisma = makePrismaMock()
    const row = buildEncryptedTenantRow(MASTER_SECRET, TENANT_ID)
    prisma.tenant.findUnique.mockResolvedValue(row)

    const manager = new CertificateManagerImpl(prisma as any)

    await manager.obtenerCert(TENANT_ID)        // va a DB
    manager.invalidarCache(TENANT_ID)           // invalida
    await manager.obtenerCert(TENANT_ID)        // vuelve a DB

    expect(prisma.tenant.findUnique).toHaveBeenCalledTimes(2)
  })

  it('cache TTL — una entrada expirada fuerza consulta a DB', async () => {
    const prisma = makePrismaMock()
    const row = buildEncryptedTenantRow(MASTER_SECRET, TENANT_ID)
    prisma.tenant.findUnique.mockResolvedValue(row)

    const manager = new CertificateManagerImpl(prisma as any)

    // Acceder directamente al cache privado mediante type casting para simular TTL expirado
    await manager.obtenerCert(TENANT_ID) // primer acceso — llena cache

    // Manipular el cache para que la entrada aparezca como expirada
    const cache = (manager as any).cache as Map<string, { cert: unknown; expiresAt: number }>
    const entry = cache.get(TENANT_ID)!
    cache.set(TENANT_ID, { ...entry, expiresAt: Date.now() - 1 }) // expirado hace 1ms

    await manager.obtenerCert(TENANT_ID) // segundo acceso — cache expirado, debe ir a DB

    expect(prisma.tenant.findUnique).toHaveBeenCalledTimes(2)
  })

  // ── fallback a env vars ────────────────────────────────────────────────────

  it('usa env vars como fallback cuando el tenant no tiene cert en DB', async () => {
    const prisma = makePrismaMock()
    // Tenant existe pero sin campos de certificado
    prisma.tenant.findUnique.mockResolvedValue({
      certEncriptado: null,
      certIv: null,
      certAuthTag: null,
      certPassEncriptado: null,
      certPassIv: null,
      certPassAuthTag: null,
      certExpiraEn: null,
    })

    // Configurar env vars de fallback
    process.env['SIFEN_CERT_PATH'] = '/tmp/test-cert.p12'
    process.env['SIFEN_CERT_PASS'] = 'fallback-pass'

    // Mockear readFileSync para el fallback
    vi.mock('node:fs', async (importOriginal) => {
      const actual = await importOriginal<typeof import('node:fs')>()
      return {
        ...actual,
        readFileSync: (path: string) => {
          if (path === '/tmp/test-cert.p12') return Buffer.from('cert-from-env')
          return actual.readFileSync(path)
        },
      }
    })

    const manager = new CertificateManagerImpl(prisma as any)
    const cert = await manager.obtenerCert(TENANT_ID)

    expect(cert.passphrase).toBe('fallback-pass')
  })

  it('lanza error si no hay cert en DB ni en env vars', async () => {
    const prisma = makePrismaMock()
    prisma.tenant.findUnique.mockResolvedValue({
      certEncriptado: null,
      certIv: null,
      certAuthTag: null,
      certPassEncriptado: null,
      certPassIv: null,
      certPassAuthTag: null,
      certExpiraEn: null,
    })

    // Sin env vars de fallback
    delete process.env['SIFEN_CERT_PATH']
    delete process.env['SIFEN_CERT_PASS']

    const manager = new CertificateManagerImpl(prisma as any)

    await expect(manager.obtenerCert(TENANT_ID)).rejects.toThrow(/certificado configurado/)
  })

  it('lanza error si el tenant no existe en DB y no hay env vars', async () => {
    const prisma = makePrismaMock()
    prisma.tenant.findUnique.mockResolvedValue(null)

    delete process.env['SIFEN_CERT_PATH']
    delete process.env['SIFEN_CERT_PASS']

    const manager = new CertificateManagerImpl(prisma as any)

    await expect(manager.obtenerCert(TENANT_ID)).rejects.toThrow()
  })

  // ── guardarCert ───────────────────────────────────────────────────────────

  it('guardarCert llama a prisma.tenant.update con datos encriptados', async () => {
    const prisma = makePrismaMock()
    prisma.tenant.update.mockResolvedValue({})

    const manager = new CertificateManagerImpl(prisma as any)
    const p12 = Buffer.from('nuevo-p12')
    const passphrase = 'nueva-pass'

    await manager.guardarCert(TENANT_ID, p12, passphrase)

    expect(prisma.tenant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: TENANT_ID },
        data: expect.objectContaining({
          certEncriptado: expect.any(Buffer),
          certIv: expect.any(String),
          certAuthTag: expect.any(String),
          certPassEncriptado: expect.any(String),
          certPassIv: expect.any(String),
          certPassAuthTag: expect.any(String),
        }),
      }),
    )
  })

  it('guardarCert invalida la cache del tenant', async () => {
    const prisma = makePrismaMock()
    const row = buildEncryptedTenantRow(MASTER_SECRET, TENANT_ID)
    prisma.tenant.findUnique.mockResolvedValue(row)
    prisma.tenant.update.mockResolvedValue({})

    const manager = new CertificateManagerImpl(prisma as any)

    // Llenar cache
    await manager.obtenerCert(TENANT_ID)
    expect(prisma.tenant.findUnique).toHaveBeenCalledTimes(1)

    // guardar nuevo cert → debe invalidar cache
    await manager.guardarCert(TENANT_ID, Buffer.from('nuevo'), 'pass')

    // Siguiente acceso debe ir a DB nuevamente
    await manager.obtenerCert(TENANT_ID)
    expect(prisma.tenant.findUnique).toHaveBeenCalledTimes(2)
  })

  it('guardarCert guarda la fecha de expiración si se provee', async () => {
    const prisma = makePrismaMock()
    prisma.tenant.update.mockResolvedValue({})

    const manager = new CertificateManagerImpl(prisma as any)
    const expiraEn = new Date('2025-12-31')

    await manager.guardarCert(TENANT_ID, Buffer.from('p12'), 'pass', expiraEn)

    expect(prisma.tenant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ certExpiraEn: expiraEn }),
      }),
    )
  })

  it('el cert guardado y luego leído desde DB es idéntico al original', async () => {
    // Este test verifica el roundtrip completo sin DB real:
    // simula guardar, captura los datos pasados a update, y los usa para obtener
    const prisma = makePrismaMock()
    let savedData: Record<string, unknown> = {}

    prisma.tenant.update.mockImplementation(async ({ data }: any) => {
      savedData = data
      return {}
    })

    const manager = new CertificateManagerImpl(prisma as any)
    const p12Original = Buffer.from('certificado-original-p12')
    const passphraseOriginal = 'passphrase-original'

    await manager.guardarCert(TENANT_ID, p12Original, passphraseOriginal)

    // Ahora simular obtener: usar los mismos datos guardados
    prisma.tenant.findUnique.mockResolvedValue({
      certEncriptado: savedData['certEncriptado'],
      certIv: savedData['certIv'],
      certAuthTag: savedData['certAuthTag'],
      certPassEncriptado: savedData['certPassEncriptado'],
      certPassIv: savedData['certPassIv'],
      certPassAuthTag: savedData['certPassAuthTag'],
      certExpiraEn: null,
    })

    const cert = await manager.obtenerCert(TENANT_ID)

    expect(cert.p12Buffer.toString()).toBe(p12Original.toString())
    expect(cert.passphrase).toBe(passphraseOriginal)
  })
})
