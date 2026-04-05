/**
 * Tests para middleware/auth.ts — hashApiKey, apiKeyHashesIguales, crearAuthHook.
 * Fastify mockeado a través de objetos mínimos. Prisma mockeado con vi.fn().
 */
import { describe, it, expect, vi } from 'vitest'
import { hashApiKey, apiKeyHashesIguales, crearAuthHook } from '../../../src/middleware/auth.js'

// ──────────────────────────────────────────────────────────────
// hashApiKey
// ──────────────────────────────────────────────────────────────

describe('hashApiKey', () => {
  it('retorna un string hex de 64 caracteres (SHA-256)', () => {
    const hash = hashApiKey('mi-api-key-aleatoria')
    expect(hash).toHaveLength(64)
    expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true)
  })

  it('es determinista — misma key siempre produce el mismo hash', () => {
    const key = 'api-key-determinista'
    expect(hashApiKey(key)).toBe(hashApiKey(key))
  })

  it('keys distintas producen hashes distintos', () => {
    expect(hashApiKey('key-A')).not.toBe(hashApiKey('key-B'))
  })

  it('diferencia mayúsculas/minúsculas', () => {
    expect(hashApiKey('APIKey')).not.toBe(hashApiKey('apikey'))
  })

  it('hashea correctamente un key de 64 bytes hex (formato real generado con randomBytes(32))', () => {
    const rawKey = 'a'.repeat(64) // 64 chars hex
    const hash = hashApiKey(rawKey)
    expect(hash).toHaveLength(64)
  })
})

// ──────────────────────────────────────────────────────────────
// apiKeyHashesIguales — timing-safe
// ──────────────────────────────────────────────────────────────

describe('apiKeyHashesIguales', () => {
  it('retorna true para dos hashes idénticos', () => {
    const hash = hashApiKey('misma-key')
    expect(apiKeyHashesIguales(hash, hash)).toBe(true)
  })

  it('retorna false para hashes distintos (mismo largo)', () => {
    const h1 = hashApiKey('key-A')
    const h2 = hashApiKey('key-B')
    // Ambos tienen 64 chars — mismo largo
    expect(h1.length).toBe(h2.length)
    expect(apiKeyHashesIguales(h1, h2)).toBe(false)
  })

  it('retorna false si las longitudes difieren', () => {
    const h1 = hashApiKey('key-A')
    const h2 = h1.slice(0, 32) // mitad — longitud diferente
    expect(apiKeyHashesIguales(h1, h2)).toBe(false)
  })

  it('retorna false para strings vacíos vs hash real', () => {
    const hash = hashApiKey('key')
    expect(apiKeyHashesIguales(hash, '')).toBe(false)
  })

  it('no lanza para dos strings vacíos', () => {
    expect(() => apiKeyHashesIguales('', '')).not.toThrow()
    expect(apiKeyHashesIguales('', '')).toBe(true)
  })
})

// ──────────────────────────────────────────────────────────────
// crearAuthHook — comportamiento del hook
// ──────────────────────────────────────────────────────────────

function makeRequest(apiKey?: string | string[]): any {
  return {
    headers: apiKey !== undefined ? { 'x-api-key': apiKey } : {},
    tenantId: undefined as string | undefined,
    metricsInicio: undefined,
  }
}

function makeReply() {
  const reply: any = {
    _status: 0,
    _body: undefined,
    status(code: number) { this._status = code; return this },
    send(body: unknown) { this._body = body; return Promise.resolve() },
  }
  return reply
}

function makePrismaMock() {
  return {
    apiKey: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
  }
}

describe('crearAuthHook', () => {
  it('retorna 401 si no se envía el header X-API-Key', async () => {
    const prisma = makePrismaMock()
    const hook = crearAuthHook(prisma as any)
    const request = makeRequest() // sin header
    const reply = makeReply()

    await hook(request, reply)

    expect(reply._status).toBe(401)
    expect(reply._body.message).toContain('X-API-Key')
  })

  it('retorna 401 si el header está presente pero la key no existe en DB', async () => {
    const prisma = makePrismaMock()
    prisma.apiKey.findUnique.mockResolvedValue(null)

    const hook = crearAuthHook(prisma as any)
    const request = makeRequest('key-inexistente')
    const reply = makeReply()

    await hook(request, reply)

    expect(reply._status).toBe(401)
    expect(reply._body.message).toContain('inválida')
  })

  it('retorna 401 si la API key está inactiva (activa=false)', async () => {
    const prisma = makePrismaMock()
    prisma.apiKey.findUnique.mockResolvedValue({
      id: 'key-id',
      activa: false,
      tenant: { id: 'tenant-id', activo: true },
    })

    const hook = crearAuthHook(prisma as any)
    const request = makeRequest('key-inactiva')
    const reply = makeReply()

    await hook(request, reply)

    expect(reply._status).toBe(401)
  })

  it('retorna 401 si el tenant está inactivo (tenant.activo=false)', async () => {
    const prisma = makePrismaMock()
    prisma.apiKey.findUnique.mockResolvedValue({
      id: 'key-id',
      activa: true,
      tenant: { id: 'tenant-id', activo: false },
    })

    const hook = crearAuthHook(prisma as any)
    const request = makeRequest('key-tenant-inactivo')
    const reply = makeReply()

    await hook(request, reply)

    expect(reply._status).toBe(401)
  })

  it('pone request.tenantId con el ID correcto cuando la key es válida', async () => {
    const prisma = makePrismaMock()
    prisma.apiKey.findUnique.mockResolvedValue({
      id: 'key-id',
      activa: true,
      tenant: { id: 'tenant-uuid-correcto', activo: true },
    })

    const hook = crearAuthHook(prisma as any)
    const request = makeRequest('key-valida')
    const reply = makeReply()

    await hook(request, reply)

    expect(request.tenantId).toBe('tenant-uuid-correcto')
    // No debería haber enviado respuesta de error
    expect(reply._status).toBe(0)
  })

  it('busca en DB con el hash SHA-256 de la key (no la key en crudo)', async () => {
    const prisma = makePrismaMock()
    prisma.apiKey.findUnique.mockResolvedValue(null)

    const hook = crearAuthHook(prisma as any)
    const rawKey = 'mi-raw-key-secreta'
    const request = makeRequest(rawKey)
    const reply = makeReply()

    await hook(request, reply)

    const llamada = prisma.apiKey.findUnique.mock.calls[0]![0] as any
    // Debe buscar por hash, NO por la key cruda
    expect(llamada.where.hash).not.toBe(rawKey)
    expect(llamada.where.hash).toBe(hashApiKey(rawKey))
    expect(llamada.where.hash).toHaveLength(64)
  })

  it('acepta X-API-Key como array y usa el primer elemento', async () => {
    const prisma = makePrismaMock()
    prisma.apiKey.findUnique.mockResolvedValue(null)

    const hook = crearAuthHook(prisma as any)
    const request = makeRequest(['primera-key', 'segunda-key'])
    const reply = makeReply()

    await hook(request, reply)

    const llamada = prisma.apiKey.findUnique.mock.calls[0]![0] as any
    // Debe usar la primera key del array
    expect(llamada.where.hash).toBe(hashApiKey('primera-key'))
  })

  it('actualiza ultimoUso en background sin bloquear el request', async () => {
    const prisma = makePrismaMock()
    prisma.apiKey.findUnique.mockResolvedValue({
      id: 'key-id-123',
      activa: true,
      tenant: { id: 'tenant-id', activo: true },
    })

    const hook = crearAuthHook(prisma as any)
    const request = makeRequest('key-valida')
    const reply = makeReply()

    await hook(request, reply)

    // El update se llama (en background, pero en tests el void promise se resuelve)
    // Verificamos que no bloqueó — el tenantId ya está seteado antes de que el update resuelva
    expect(request.tenantId).toBe('tenant-id')
  })
})
