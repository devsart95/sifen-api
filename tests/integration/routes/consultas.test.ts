import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import supertest from 'supertest'
import type { FastifyInstance } from 'fastify'
import {
  buildTestApp,
  crearContextoTest,
  getPrisma,
  teardownPrisma,
  type TestContext,
} from '../helpers/app.js'

describe('GET /v1/consultas/ruc/:ruc', () => {
  let app: FastifyInstance
  let ctx: TestContext

  beforeAll(async () => {
    const prisma = getPrisma()
    ctx = await crearContextoTest(prisma)
    app = await buildTestApp(prisma)
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
    await teardownPrisma()
  })

  it('requiere autenticación', async () => {
    const res = await supertest(app.server).get('/v1/consultas/ruc/80069563-1')
    expect(res.status).toBe(401)
  })

  it('consulta un RUC válido y retorna 200', async () => {
    const res = await supertest(app.server)
      .get('/v1/consultas/ruc/80069563-1')
      .set('X-API-Key', ctx.apiKey)

    expect(res.status).toBe(200)
    expect(res.body.ruc).toBe('80069563-1')
    expect(res.body.respuestaXml).toBeDefined()
  })

  it('retorna 422 para RUC con DV incorrecto', async () => {
    const res = await supertest(app.server)
      .get('/v1/consultas/ruc/80069563-9')  // DV incorrecto
      .set('X-API-Key', ctx.apiKey)

    expect(res.status).toBe(422)
    expect(res.body.error).toContain('RUC')
  })

  it('retorna 502 si SIFEN no responde', async () => {
    const prisma = getPrisma()
    const ctxFail = await crearContextoTest(prisma)
    const appFail = await buildTestApp(prisma, {
      consultarRuc: async () => ({ ok: false, error: 'Timeout SIFEN', statusCode: 504 }),
    })
    await appFail.ready()

    const res = await supertest(appFail.server)
      .get('/v1/consultas/ruc/80069563-1')
      .set('X-API-Key', ctxFail.apiKey)

    expect(res.status).toBe(502)
    await appFail.close()
  })
})

describe('GET /v1/consultas/lote/:protocolo', () => {
  let app: FastifyInstance
  let ctx: TestContext

  beforeAll(async () => {
    const prisma = getPrisma()
    ctx = await crearContextoTest(prisma)
    app = await buildTestApp(prisma)
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('consulta un protocolo y retorna respuesta XML', async () => {
    const res = await supertest(app.server)
      .get('/v1/consultas/lote/999888777')
      .set('X-API-Key', ctx.apiKey)

    expect(res.status).toBe(200)
    expect(res.body.protocolo).toBe('999888777')
    expect(res.body.respuestaXml).toBeDefined()
  })
})
