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
import { PAYLOAD_FACTURA_MINIMA } from '../helpers/payload.js'

// Mockear la firma XMLDSig — no tenemos cert real en tests de integración
vi.mock('../../../src/services/xml/signer.js', () => ({
  firmarXmlDe: (_xml: string) => ({
    xmlFirmado: _xml + '<!-- firmado-mock -->',
    digestValue: 'mock-digest-base64==',
  }),
}))

// Mockear la lectura del archivo del certificado
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    readFileSync: (path: string) => {
      if (String(path).endsWith('.p12') || path === '/dev/null') {
        return Buffer.from('mock-cert')
      }
      return actual.readFileSync(path)
    },
  }
})

describe('POST /v1/documentos', () => {
  let app: FastifyInstance
  let ctx: TestContext
  let cdcEmitido: string

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

  it('requiere autenticación — retorna 401 sin API key', async () => {
    const res = await supertest(app.server)
      .post('/v1/documentos')
      .send(PAYLOAD_FACTURA_MINIMA)
    expect(res.status).toBe(401)
  })

  it('retorna 401 con API key inválida', async () => {
    const res = await supertest(app.server)
      .post('/v1/documentos')
      .set('X-API-Key', 'clave-incorrecta')
      .send(PAYLOAD_FACTURA_MINIMA)
    expect(res.status).toBe(401)
  })

  it('emite una factura y retorna 201 con CDC', async () => {
    const res = await supertest(app.server)
      .post('/v1/documentos')
      .set('X-API-Key', ctx.apiKey)
      .send(PAYLOAD_FACTURA_MINIMA)

    expect(res.status).toBe(201)
    expect(res.body.cdc).toBeDefined()
    expect(String(res.body.cdc as string)).toHaveLength(44)
    expect(res.body.estado).toBe('APROBADO')

    cdcEmitido = res.body.cdc as string
  })

  it('el documento queda guardado en DB con estado APROBADO', async () => {
    const prisma = getPrisma()
    const doc = await prisma.documentoElectronico.findUnique({
      where: { cdc: cdcEmitido },
    })
    expect(doc).not.toBeNull()
    expect(doc?.estado).toBe('APROBADO')
    expect(doc?.tenantId).toBe(ctx.tenantId)
  })

  it('retorna 422 si el payload falta campos requeridos', async () => {
    const res = await supertest(app.server)
      .post('/v1/documentos')
      .set('X-API-Key', ctx.apiKey)
      .send({ tipoDocumento: 1 })  // payload incompleto

    expect(res.status).toBe(422)
  })

  it('retorna 422 si el timbrado no existe para el tenant', async () => {
    const payload = {
      ...PAYLOAD_FACTURA_MINIMA,
      timbrado: {
        ...PAYLOAD_FACTURA_MINIMA.timbrado,
        numero: '99999999',  // timbrado que no existe
      },
    }
    const res = await supertest(app.server)
      .post('/v1/documentos')
      .set('X-API-Key', ctx.apiKey)
      .send(payload)

    expect(res.status).toBe(422)
    expect(res.body.error).toContain('Timbrado')
  })

  it('propaga el error de SIFEN si rechaza el documento', async () => {
    const prisma = getPrisma()
    const ctxSifenFail = await crearContextoTest(prisma)
    const appSifenFail = await buildTestApp(prisma, {
      recibirDe: async () => ({
        ok: false,
        error: 'CDC duplicado en SIFEN',
        statusCode: 422,
      }),
    })
    await appSifenFail.ready()

    const res = await supertest(appSifenFail.server)
      .post('/v1/documentos')
      .set('X-API-Key', ctxSifenFail.apiKey)
      .send(PAYLOAD_FACTURA_MINIMA)

    expect(res.status).toBe(422)
    expect(res.body.error).toContain('SIFEN')

    await appSifenFail.close()
  })
})

describe('GET /v1/documentos/:cdc', () => {
  let app: FastifyInstance
  let ctx: TestContext
  let cdcExistente: string

  beforeAll(async () => {
    const prisma = getPrisma()
    ctx = await crearContextoTest(prisma)
    app = await buildTestApp(prisma)
    await app.ready()

    // Emitir un doc para consultarlo
    const res = await supertest(app.server)
      .post('/v1/documentos')
      .set('X-API-Key', ctx.apiKey)
      .send(PAYLOAD_FACTURA_MINIMA)

    cdcExistente = res.body.cdc as string
  })

  afterAll(async () => {
    await app.close()
  })

  it('retorna el documento con su estado y datos de SIFEN', async () => {
    const res = await supertest(app.server)
      .get(`/v1/documentos/${cdcExistente}`)
      .set('X-API-Key', ctx.apiKey)

    expect(res.status).toBe(200)
    expect(res.body.cdc).toBe(cdcExistente)
    expect(res.body.estado).toBe('APROBADO')
    expect(res.body.sifen).toBeDefined()
  })

  it('retorna 404 para CDC inexistente', async () => {
    const cdcFalso = '01800695631001001010000001202411290100000000019'  // 44 chars pero no existe
    const res = await supertest(app.server)
      .get(`/v1/documentos/${cdcFalso}`)
      .set('X-API-Key', ctx.apiKey)

    expect(res.status).toBe(404)
  })

  it('retorna 401 sin autenticación', async () => {
    const res = await supertest(app.server)
      .get(`/v1/documentos/${cdcExistente}`)

    expect(res.status).toBe(401)
  })

  it('aislamiento de tenant — otro tenant no ve el documento', async () => {
    const prisma = getPrisma()
    const otroCtx = await crearContextoTest(prisma)

    const res = await supertest(app.server)
      .get(`/v1/documentos/${cdcExistente}`)
      .set('X-API-Key', otroCtx.apiKey)

    expect(res.status).toBe(404)
  })
})
