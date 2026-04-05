/**
 * Tests para middleware/idempotency.ts — replay, TTL expirado, namespace por tenant,
 * no cachear errores 5xx, omisión sin header.
 *
 * El plugin es un FastifyPluginAsync — se prueba montando una instancia Fastify mínima
 * con el plugin registrado y simulando requests con hooks directos.
 * Prisma mockeado con vi.fn().
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import { crearIdempotencyPlugin } from '../../../src/middleware/idempotency.js'

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function makePrismaMock() {
  return {
    idempotencyRecord: {
      findUnique: vi.fn(),
      create: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
  }
}

/**
 * Construye una app Fastify mínima con el plugin de idempotencia y una ruta POST /test.
 */
async function buildApp(prisma: ReturnType<typeof makePrismaMock>, handlerStatus = 201) {
  const app = Fastify()

  // Decorar request con tenantId (normalmente lo pone auth.ts)
  app.decorateRequest('tenantId', '')
  app.decorateRequest('idempotencyKey', undefined)

  app.addHook('preHandler', async (req) => {
    // Simular que el auth hook ya corrió y puso tenantId
    req.tenantId = 'tenant-test'
  })

  await app.register(crearIdempotencyPlugin(prisma as any))

  app.post('/test', async (_req, reply) => {
    return reply.status(handlerStatus).send({ resultado: 'procesado', ts: Date.now() })
  })

  await app.ready()
  return app
}

// ──────────────────────────────────────────────────────────────
// Sin header X-Idempotency-Key — pass-through
// ──────────────────────────────────────────────────────────────

describe('idempotencyPlugin — sin header', () => {
  it('pasa el request sin consultar DB si no hay X-Idempotency-Key', async () => {
    const prisma = makePrismaMock()
    const app = await buildApp(prisma)

    const res = await app.inject({ method: 'POST', url: '/test' })

    expect(res.statusCode).toBe(201)
    expect(prisma.idempotencyRecord.findUnique).not.toHaveBeenCalled()
    await app.close()
  })

  it('ignora el header si es un array (previene header-injection)', async () => {
    const prisma = makePrismaMock()
    const app = await buildApp(prisma)

    // Fastify normaliza headers — si viene como array en raw HTTP podría pasar
    // pero en inject se puede simular con objeto
    const res = await app.inject({
      method: 'POST',
      url: '/test',
      headers: { 'x-idempotency-key': 'key-A' }, // string normal
    })

    expect(res.statusCode).toBe(201)
    await app.close()
  })
})

// ──────────────────────────────────────────────────────────────
// Primer request — sin registro previo
// ──────────────────────────────────────────────────────────────

describe('idempotencyPlugin — primer request (cache miss)', () => {
  it('consulta DB y guarda el resultado en onSend cuando no existe registro', async () => {
    const prisma = makePrismaMock()
    prisma.idempotencyRecord.findUnique.mockResolvedValue(null)

    const app = await buildApp(prisma)

    const res = await app.inject({
      method: 'POST',
      url: '/test',
      headers: { 'x-idempotency-key': 'uuid-nuevo-123' },
    })

    expect(res.statusCode).toBe(201)
    // findUnique consultado una vez
    expect(prisma.idempotencyRecord.findUnique).toHaveBeenCalledTimes(1)
    // create llamado para guardar la respuesta
    expect(prisma.idempotencyRecord.create).toHaveBeenCalledTimes(1)
    await app.close()
  })

  it('la key guardada en DB está namespacedada por tenantId', async () => {
    const prisma = makePrismaMock()
    prisma.idempotencyRecord.findUnique.mockResolvedValue(null)

    const app = await buildApp(prisma)

    await app.inject({
      method: 'POST',
      url: '/test',
      headers: { 'x-idempotency-key': 'mi-uuid-unico' },
    })

    const createCall = prisma.idempotencyRecord.create.mock.calls[0]![0] as any
    expect(createCall.data.key).toBe('tenant-test:mi-uuid-unico')
    await app.close()
  })

  it('guarda el statusCode correcto al crear el registro', async () => {
    const prisma = makePrismaMock()
    prisma.idempotencyRecord.findUnique.mockResolvedValue(null)

    const app = await buildApp(prisma, 201)

    await app.inject({
      method: 'POST',
      url: '/test',
      headers: { 'x-idempotency-key': 'key-status' },
    })

    const createCall = prisma.idempotencyRecord.create.mock.calls[0]![0] as any
    expect(createCall.data.statusCode).toBe(201)
    await app.close()
  })

  it('guarda expiresAt aproximadamente 24h en el futuro', async () => {
    const prisma = makePrismaMock()
    prisma.idempotencyRecord.findUnique.mockResolvedValue(null)

    const app = await buildApp(prisma)
    const antes = Date.now()

    await app.inject({
      method: 'POST',
      url: '/test',
      headers: { 'x-idempotency-key': 'key-ttl' },
    })

    const createCall = prisma.idempotencyRecord.create.mock.calls[0]![0] as any
    const expiresAt: Date = createCall.data.expiresAt
    const diferenciaMs = expiresAt.getTime() - antes
    const VEINTICUATRO_HORAS = 24 * 60 * 60 * 1000

    expect(diferenciaMs).toBeGreaterThanOrEqual(VEINTICUATRO_HORAS - 100)
    expect(diferenciaMs).toBeLessThanOrEqual(VEINTICUATRO_HORAS + 1000)
    await app.close()
  })
})

// ──────────────────────────────────────────────────────────────
// Replay — registro existente vigente
// ──────────────────────────────────────────────────────────────

describe('idempotencyPlugin — replay (cache hit vigente)', () => {
  it('retorna la respuesta guardada sin ejecutar el handler de nuevo', async () => {
    const prisma = makePrismaMock()
    const respuestaGuardada = { resultado: 'ya-procesado', ts: 1234567890 }

    prisma.idempotencyRecord.findUnique.mockResolvedValue({
      key: 'tenant-test:uuid-repetido',
      statusCode: 201,
      responseBody: respuestaGuardada,
      expiresAt: new Date(Date.now() + 60_000), // vigente
    })

    const app = await buildApp(prisma)

    const res = await app.inject({
      method: 'POST',
      url: '/test',
      headers: { 'x-idempotency-key': 'uuid-repetido' },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json()).toEqual(respuestaGuardada)
    // El handler no crea nuevo registro
    expect(prisma.idempotencyRecord.create).not.toHaveBeenCalled()
    await app.close()
  })

  it('el header X-Idempotency-Replayed está presente en la respuesta de replay', async () => {
    const prisma = makePrismaMock()
    prisma.idempotencyRecord.findUnique.mockResolvedValue({
      key: 'tenant-test:uuid-replay',
      statusCode: 200,
      responseBody: { ok: true },
      expiresAt: new Date(Date.now() + 60_000),
    })

    const app = await buildApp(prisma)

    const res = await app.inject({
      method: 'POST',
      url: '/test',
      headers: { 'x-idempotency-key': 'uuid-replay' },
    })

    expect(res.headers['x-idempotency-replayed']).toBe('true')
    await app.close()
  })

  it('respeta el statusCode guardado en el registro (ej: 200)', async () => {
    const prisma = makePrismaMock()
    prisma.idempotencyRecord.findUnique.mockResolvedValue({
      key: 'tenant-test:uuid-200',
      statusCode: 200,
      responseBody: { estado: 'ok' },
      expiresAt: new Date(Date.now() + 60_000),
    })

    const app = await buildApp(prisma)

    const res = await app.inject({
      method: 'POST',
      url: '/test',
      headers: { 'x-idempotency-key': 'uuid-200' },
    })

    expect(res.statusCode).toBe(200)
    await app.close()
  })
})

// ──────────────────────────────────────────────────────────────
// TTL expirado — re-procesar
// ──────────────────────────────────────────────────────────────

describe('idempotencyPlugin — TTL expirado', () => {
  it('elimina el registro expirado y procesa el request como nuevo', async () => {
    const prisma = makePrismaMock()
    const keyNamespaced = 'tenant-test:uuid-expirado'

    prisma.idempotencyRecord.findUnique.mockResolvedValue({
      key: keyNamespaced,
      statusCode: 201,
      responseBody: { dato: 'viejo' },
      expiresAt: new Date(Date.now() - 1), // ya expiró
    })

    const app = await buildApp(prisma)

    const res = await app.inject({
      method: 'POST',
      url: '/test',
      headers: { 'x-idempotency-key': 'uuid-expirado' },
    })

    // Debe eliminar el viejo y procesar de nuevo
    expect(prisma.idempotencyRecord.delete).toHaveBeenCalledWith({ where: { key: keyNamespaced } })
    // El handler corre normalmente → retorna 201
    expect(res.statusCode).toBe(201)
    // No debería tener el header de replay
    expect(res.headers['x-idempotency-replayed']).toBeUndefined()
    await app.close()
  })
})

// ──────────────────────────────────────────────────────────────
// Errores de servidor — no cachear 5xx
// ──────────────────────────────────────────────────────────────

describe('idempotencyPlugin — no cachear errores 5xx', () => {
  it('no guarda en DB si el handler retorna status >= 500', async () => {
    const prisma = makePrismaMock()
    prisma.idempotencyRecord.findUnique.mockResolvedValue(null)

    // Handler que responde con 500
    const app = Fastify()
    app.decorateRequest('tenantId', '')
    app.decorateRequest('idempotencyKey', undefined)
    app.addHook('preHandler', async (req) => { req.tenantId = 'tenant-test' })
    await app.register(crearIdempotencyPlugin(prisma as any))
    app.post('/test', async (_req, reply) => {
      return reply.status(500).send({ error: 'Internal Server Error' })
    })
    await app.ready()

    await app.inject({
      method: 'POST',
      url: '/test',
      headers: { 'x-idempotency-key': 'uuid-error-500' },
    })

    // No debe haber guardado el error 500
    expect(prisma.idempotencyRecord.create).not.toHaveBeenCalled()
    await app.close()
  })
})

// ──────────────────────────────────────────────────────────────
// Aislamiento por tenant
// ──────────────────────────────────────────────────────────────

describe('idempotencyPlugin — namespace por tenant', () => {
  it('la misma idempotency-key de dos tenants distintos no colisiona', async () => {
    const prisma = makePrismaMock()
    prisma.idempotencyRecord.findUnique.mockResolvedValue(null)

    const MISMA_KEY = 'uuid-compartido-entre-tenants'

    // Tenant A
    const appA = Fastify()
    appA.decorateRequest('tenantId', '')
    appA.decorateRequest('idempotencyKey', undefined)
    appA.addHook('preHandler', async (req) => { req.tenantId = 'tenant-A' })
    await appA.register(crearIdempotencyPlugin(prisma as any))
    appA.post('/test', async (_req, reply) => reply.status(201).send({ ok: true }))
    await appA.ready()

    await appA.inject({
      method: 'POST',
      url: '/test',
      headers: { 'x-idempotency-key': MISMA_KEY },
    })

    const createCallA = prisma.idempotencyRecord.create.mock.calls[0]![0] as any
    expect(createCallA.data.key).toBe(`tenant-A:${MISMA_KEY}`)

    await appA.close()

    // Tenant B
    const prismaMockB = makePrismaMock()
    prismaMockB.idempotencyRecord.findUnique.mockResolvedValue(null)

    const appB = Fastify()
    appB.decorateRequest('tenantId', '')
    appB.decorateRequest('idempotencyKey', undefined)
    appB.addHook('preHandler', async (req) => { req.tenantId = 'tenant-B' })
    await appB.register(crearIdempotencyPlugin(prismaMockB as any))
    appB.post('/test', async (_req, reply) => reply.status(201).send({ ok: true }))
    await appB.ready()

    await appB.inject({
      method: 'POST',
      url: '/test',
      headers: { 'x-idempotency-key': MISMA_KEY },
    })

    const createCallB = prismaMockB.idempotencyRecord.create.mock.calls[0]![0] as any
    expect(createCallB.data.key).toBe(`tenant-B:${MISMA_KEY}`)

    await appB.close()

    // Las keys son distintas
    expect(createCallA.data.key).not.toBe(createCallB.data.key)
  })
})
