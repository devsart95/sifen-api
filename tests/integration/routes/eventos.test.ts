import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import supertest from 'supertest'
import type { FastifyInstance } from 'fastify'
import {
  buildTestApp,
  crearContextoTest,
  getPrisma,
  teardownPrisma,
  type TestContext,
} from '../helpers/app.js'
import {
  PAYLOAD_FACTURA_MINIMA,
  PAYLOAD_CANCELACION,
  PAYLOAD_INUTILIZACION,
} from '../helpers/payload.js'

vi.mock('../../../src/services/xml/signer.js', () => ({
  firmarXmlDe: (_xml: string) => ({
    xmlFirmado: _xml + '<!-- firmado-mock -->',
    digestValue: 'mock-digest-base64==',
  }),
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    readFileSync: (path: string) => {
      if (String(path).endsWith('.p12') || path === '/dev/null') return Buffer.from('mock-cert')
      return actual.readFileSync(path)
    },
  }
})

describe('POST /v1/eventos', () => {
  let app: FastifyInstance
  let ctx: TestContext
  let cdcEmitido: string

  beforeAll(async () => {
    const prisma = getPrisma()
    ctx = await crearContextoTest(prisma)
    app = await buildTestApp(prisma)
    await app.ready()

    // Emitir documento para poder cancelarlo
    const res = await supertest(app.server)
      .post('/v1/documentos')
      .set('X-API-Key', ctx.apiKey)
      .send(PAYLOAD_FACTURA_MINIMA)

    cdcEmitido = res.body.cdc as string
  })

  afterAll(async () => {
    await app.close()
    await teardownPrisma()
  })

  it('requiere autenticación', async () => {
    const res = await supertest(app.server)
      .post('/v1/eventos')
      .send(PAYLOAD_CANCELACION(cdcEmitido))
    expect(res.status).toBe(401)
  })

  it('cancela un DE existente y retorna 201', async () => {
    const res = await supertest(app.server)
      .post('/v1/eventos')
      .set('X-API-Key', ctx.apiKey)
      .send(PAYLOAD_CANCELACION(cdcEmitido))

    expect(res.status).toBe(201)
    expect(res.body.tipoEvento).toBe(1)
    expect(res.body.estado).toBe('ACEPTADO')
  })

  it('el DE queda con estado CANCELADO en DB', async () => {
    const prisma = getPrisma()
    const doc = await prisma.documentoElectronico.findUnique({ where: { cdc: cdcEmitido } })
    expect(doc?.estado).toBe('CANCELADO')
  })

  it('procesa inutilización de numeración', async () => {
    const res = await supertest(app.server)
      .post('/v1/eventos')
      .set('X-API-Key', ctx.apiKey)
      .send(PAYLOAD_INUTILIZACION)

    expect(res.status).toBe(201)
    expect(res.body.tipoEvento).toBe(2)
  })

  it('retorna 422 si SIFEN rechaza el evento', async () => {
    const prisma = getPrisma()
    const ctxFail = await crearContextoTest(prisma)
    const appFail = await buildTestApp(prisma, {
      recibirEvento: async () => ({ ok: false, error: 'CDC no existe en SIFEN', statusCode: 422 }),
    })
    await appFail.ready()

    const res = await supertest(appFail.server)
      .post('/v1/eventos')
      .set('X-API-Key', ctxFail.apiKey)
      .send(PAYLOAD_CANCELACION(cdcEmitido))

    expect(res.status).toBe(422)
    await appFail.close()
  })

  it('retorna 422 para payload de evento inválido', async () => {
    const res = await supertest(app.server)
      .post('/v1/eventos')
      .set('X-API-Key', ctx.apiKey)
      .send({ tipo: 1 })  // falta cdc y motivo

    expect(res.status).toBe(422)
  })
})
