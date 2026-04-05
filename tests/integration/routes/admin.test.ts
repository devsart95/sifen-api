/**
 * Tests de integración para /v1/admin/* — CRUD de tenants, API keys, timbrados.
 * Cubre: isAdmin check (403), P2025 (404), P2002 (409).
 * Requiere DB de test (ver helpers/app.ts).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import supertest from 'supertest'
import type { FastifyInstance } from 'fastify'
import { buildTestApp, getPrisma, teardownPrisma } from '../helpers/app.js'
import { hashApiKey } from '../../../src/middleware/auth.js'

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Crea un tenant + API key con isAdmin=true para las rutas de admin.
 */
async function crearAdminKey(prisma: ReturnType<typeof getPrisma>) {
  const rawKey = `admin-key-${Date.now()}`

  const tenant = await prisma.tenant.create({
    data: {
      nombre: 'Tenant Admin Test',
      ruc: String(Math.floor(10_000_000 + Math.random() * 89_999_999)),
      dvRuc: '1',
    },
  })

  await prisma.apiKey.create({
    data: {
      tenantId: tenant.id,
      hash: hashApiKey(rawKey),
      nombre: 'Admin key de test',
      isAdmin: true,
    },
  })

  return { tenantId: tenant.id, adminKey: rawKey }
}

/**
 * Crea un tenant + API key con isAdmin=false (key de usuario normal).
 */
async function crearUserKey(prisma: ReturnType<typeof getPrisma>) {
  const rawKey = `user-key-${Date.now()}`

  const tenant = await prisma.tenant.create({
    data: {
      nombre: 'Tenant Usuario Normal',
      ruc: String(Math.floor(10_000_000 + Math.random() * 89_999_999)),
      dvRuc: '1',
    },
  })

  await prisma.apiKey.create({
    data: {
      tenantId: tenant.id,
      hash: hashApiKey(rawKey),
      nombre: 'User key de test',
      isAdmin: false,
    },
  })

  return { tenantId: tenant.id, userKey: rawKey }
}

// ──────────────────────────────────────────────────────────────────────────────
// Autenticación de admin
// ──────────────────────────────────────────────────────────────────────────────

describe('Admin — control de acceso', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    const prisma = getPrisma()
    app = await buildTestApp(prisma)
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
    await teardownPrisma()
  })

  it('retorna 401 sin API key en rutas admin', async () => {
    const res = await supertest(app.server).get('/v1/admin/tenants')
    expect(res.status).toBe(401)
  })

  it('retorna 403 con API key de usuario (isAdmin=false)', async () => {
    const prisma = getPrisma()
    const { userKey } = await crearUserKey(prisma)

    const res = await supertest(app.server)
      .get('/v1/admin/tenants')
      .set('X-API-Key', userKey)

    expect(res.status).toBe(403)
    expect(res.body.error).toBe('Forbidden')
  })

  it('permite acceso con API key admin (isAdmin=true)', async () => {
    const prisma = getPrisma()
    const { adminKey } = await crearAdminKey(prisma)

    const res = await supertest(app.server)
      .get('/v1/admin/tenants')
      .set('X-API-Key', adminKey)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// GET /v1/admin/tenants
// ──────────────────────────────────────────────────────────────────────────────

describe('GET /v1/admin/tenants', () => {
  let app: FastifyInstance
  let adminKey: string

  beforeAll(async () => {
    const prisma = getPrisma()
    const ctx = await crearAdminKey(prisma)
    adminKey = ctx.adminKey
    app = await buildTestApp(prisma)
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('retorna array de tenants con los campos esperados', async () => {
    const res = await supertest(app.server)
      .get('/v1/admin/tenants')
      .set('X-API-Key', adminKey)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    if (res.body.length > 0) {
      const tenant = res.body[0] as Record<string, unknown>
      expect(tenant).toHaveProperty('id')
      expect(tenant).toHaveProperty('nombre')
      expect(tenant).toHaveProperty('ruc')
      expect(tenant).toHaveProperty('activo')
      // No debe exponer campos sensibles de cert
      expect(tenant).not.toHaveProperty('certEncriptado')
    }
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// POST /v1/admin/tenants
// ──────────────────────────────────────────────────────────────────────────────

describe('POST /v1/admin/tenants', () => {
  let app: FastifyInstance
  let adminKey: string

  beforeAll(async () => {
    const prisma = getPrisma()
    const ctx = await crearAdminKey(prisma)
    adminKey = ctx.adminKey
    app = await buildTestApp(prisma)
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('crea un tenant y retorna 201 con los datos básicos', async () => {
    const rucUnico = String(Math.floor(10_000_000 + Math.random() * 89_999_999))
    const res = await supertest(app.server)
      .post('/v1/admin/tenants')
      .set('X-API-Key', adminKey)
      .send({ nombre: 'Empresa Test SA', ruc: rucUnico, dvRuc: '1' })

    expect(res.status).toBe(201)
    expect(res.body.id).toBeDefined()
    expect(res.body.nombre).toBe('Empresa Test SA')
    expect(res.body.ruc).toBe(rucUnico)
  })

  it('retorna 422 si falta el campo nombre', async () => {
    const res = await supertest(app.server)
      .post('/v1/admin/tenants')
      .set('X-API-Key', adminKey)
      .send({ ruc: '12345678', dvRuc: '1' })

    expect(res.status).toBe(422)
  })

  it('retorna 422 si falta el campo ruc', async () => {
    const res = await supertest(app.server)
      .post('/v1/admin/tenants')
      .set('X-API-Key', adminKey)
      .send({ nombre: 'Sin RUC SA', dvRuc: '1' })

    expect(res.status).toBe(422)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// GET /v1/admin/tenants/:tenantId
// ──────────────────────────────────────────────────────────────────────────────

describe('GET /v1/admin/tenants/:tenantId', () => {
  let app: FastifyInstance
  let adminKey: string
  let tenantIdExistente: string

  beforeAll(async () => {
    const prisma = getPrisma()
    const ctx = await crearAdminKey(prisma)
    adminKey = ctx.adminKey
    tenantIdExistente = ctx.tenantId
    app = await buildTestApp(prisma)
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('retorna el tenant con 200 cuando existe', async () => {
    const res = await supertest(app.server)
      .get(`/v1/admin/tenants/${tenantIdExistente}`)
      .set('X-API-Key', adminKey)

    expect(res.status).toBe(200)
    expect(res.body.id).toBe(tenantIdExistente)
    expect(res.body).toHaveProperty('ruc')
    expect(res.body).toHaveProperty('activo')
  })

  it('retorna 404 para tenantId inexistente', async () => {
    const idFalso = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    const res = await supertest(app.server)
      .get(`/v1/admin/tenants/${idFalso}`)
      .set('X-API-Key', adminKey)

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Not Found')
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// PUT /v1/admin/tenants/:tenantId
// ──────────────────────────────────────────────────────────────────────────────

describe('PUT /v1/admin/tenants/:tenantId', () => {
  let app: FastifyInstance
  let adminKey: string
  let tenantIdExistente: string

  beforeAll(async () => {
    const prisma = getPrisma()
    const ctx = await crearAdminKey(prisma)
    adminKey = ctx.adminKey
    tenantIdExistente = ctx.tenantId
    app = await buildTestApp(prisma)
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('actualiza el tenant y retorna los datos nuevos', async () => {
    const res = await supertest(app.server)
      .put(`/v1/admin/tenants/${tenantIdExistente}`)
      .set('X-API-Key', adminKey)
      .send({ nombre: 'Nombre Actualizado SA' })

    expect(res.status).toBe(200)
    expect(res.body.nombre).toBe('Nombre Actualizado SA')
  })

  it('retorna 404 al actualizar tenant inexistente (P2025)', async () => {
    const idFalso = 'aaaaaaaa-bbbb-cccc-dddd-ffffffffffff'
    const res = await supertest(app.server)
      .put(`/v1/admin/tenants/${idFalso}`)
      .set('X-API-Key', adminKey)
      .send({ nombre: 'No importa' })

    expect(res.status).toBe(404)
  })

  it('puede desactivar un tenant (activo: false)', async () => {
    const res = await supertest(app.server)
      .put(`/v1/admin/tenants/${tenantIdExistente}`)
      .set('X-API-Key', adminKey)
      .send({ activo: false })

    expect(res.status).toBe(200)
    expect(res.body.activo).toBe(false)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// POST /v1/admin/tenants/:tenantId/api-keys
// ──────────────────────────────────────────────────────────────────────────────

describe('POST /v1/admin/tenants/:tenantId/api-keys', () => {
  let app: FastifyInstance
  let adminKey: string
  let tenantIdTarget: string

  beforeAll(async () => {
    const prisma = getPrisma()
    const ctx = await crearAdminKey(prisma)
    adminKey = ctx.adminKey
    tenantIdTarget = ctx.tenantId
    app = await buildTestApp(prisma)
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('crea una API key y retorna 201 con el valor raw (solo visible una vez)', async () => {
    const res = await supertest(app.server)
      .post(`/v1/admin/tenants/${tenantIdTarget}/api-keys`)
      .set('X-API-Key', adminKey)
      .send({ nombre: 'Key de producción' })

    expect(res.status).toBe(201)
    expect(res.body.apiKey).toBeDefined()
    // La key raw es un hex de 64 chars (randomBytes(32).toString('hex'))
    expect((res.body.apiKey as string).length).toBeGreaterThanOrEqual(32)
    expect(res.body.advertencia).toBeDefined()
    // No debe exponerse el hash
    expect(res.body).not.toHaveProperty('hash')
  })

  it('retorna 404 al crear key para tenant inexistente', async () => {
    const idFalso = 'aaaaaaaa-bbbb-0000-dddd-eeeeeeeeeeee'
    const res = await supertest(app.server)
      .post(`/v1/admin/tenants/${idFalso}/api-keys`)
      .set('X-API-Key', adminKey)
      .send({ nombre: 'Key Fantasma' })

    expect(res.status).toBe(404)
  })

  it('la key creada puede autenticar requests normales', async () => {
    const prisma = getPrisma()

    // Crear tenant fresh con timbrado para la prueba de autenticación
    const ruc = String(Math.floor(10_000_000 + Math.random() * 89_999_999))
    const tenantNew = await prisma.tenant.create({
      data: { nombre: 'Tenant Con Key Nueva', ruc, dvRuc: '1' },
    })

    const res = await supertest(app.server)
      .post(`/v1/admin/tenants/${tenantNew.id}/api-keys`)
      .set('X-API-Key', adminKey)
      .send({ nombre: 'Key nueva funcional' })

    expect(res.status).toBe(201)
    const nuevaKey = res.body.apiKey as string

    // La nueva key puede autenticar en rutas normales (ej: consultas)
    const resAuth = await supertest(app.server)
      .get('/v1/consultas/ruc/80069563-1')
      .set('X-API-Key', nuevaKey)

    // Con la key válida debe pasar auth → puede ser 200 o error de SIFEN mock, no 401
    expect(resAuth.status).not.toBe(401)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// DELETE /v1/admin/tenants/:tenantId/api-keys/:keyId (revocar)
// ──────────────────────────────────────────────────────────────────────────────

describe('DELETE /v1/admin/tenants/:tenantId/api-keys/:keyId', () => {
  let app: FastifyInstance
  let adminKey: string
  let tenantIdTarget: string

  beforeAll(async () => {
    const prisma = getPrisma()
    const ctx = await crearAdminKey(prisma)
    adminKey = ctx.adminKey
    tenantIdTarget = ctx.tenantId
    app = await buildTestApp(prisma)
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('revoca una API key y retorna 204', async () => {
    const prisma = getPrisma()
    // Crear una key extra para revocar
    const rawKey = `key-a-revocar-${Date.now()}`
    const apiKeyRecord = await prisma.apiKey.create({
      data: {
        tenantId: tenantIdTarget,
        hash: hashApiKey(rawKey),
        nombre: 'Key a revocar',
        isAdmin: false,
      },
    })

    const res = await supertest(app.server)
      .delete(`/v1/admin/tenants/${tenantIdTarget}/api-keys/${apiKeyRecord.id}`)
      .set('X-API-Key', adminKey)

    expect(res.status).toBe(204)

    // La key revocada ya no puede autenticar
    const resRevocada = await supertest(app.server)
      .get('/v1/consultas/ruc/80069563-1')
      .set('X-API-Key', rawKey)

    expect(resRevocada.status).toBe(401)
  })

  it('retorna 404 al revocar key inexistente (P2025)', async () => {
    const idFalso = 'aaaaaaaa-0000-cccc-dddd-eeeeeeeeeeee'
    const res = await supertest(app.server)
      .delete(`/v1/admin/tenants/${tenantIdTarget}/api-keys/${idFalso}`)
      .set('X-API-Key', adminKey)

    expect(res.status).toBe(404)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// POST /v1/admin/tenants/:tenantId/timbrados — P2002 (unique constraint)
// ──────────────────────────────────────────────────────────────────────────────

describe('POST /v1/admin/tenants/:tenantId/timbrados', () => {
  let app: FastifyInstance
  let adminKey: string
  let tenantIdTarget: string

  beforeAll(async () => {
    const prisma = getPrisma()
    const ctx = await crearAdminKey(prisma)
    adminKey = ctx.adminKey
    tenantIdTarget = ctx.tenantId
    app = await buildTestApp(prisma)
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('crea un timbrado y retorna 201', async () => {
    const res = await supertest(app.server)
      .post(`/v1/admin/tenants/${tenantIdTarget}/timbrados`)
      .set('X-API-Key', adminKey)
      .send({
        numero: '12345678',
        establecimiento: '001',
        puntoExpedicion: '001',
        tipoDocumento: 1,
        fechaInicio: '2024-01-01',
      })

    expect(res.status).toBe(201)
    expect(res.body.id).toBeDefined()
    expect(res.body.numero).toBe('12345678')
  })

  it('retorna 409 al crear timbrado duplicado (P2002)', async () => {
    const payload = {
      numero: '99999901',
      establecimiento: '001',
      puntoExpedicion: '001',
      tipoDocumento: 1,
      fechaInicio: '2024-01-01',
    }

    // Primera creación exitosa
    const res1 = await supertest(app.server)
      .post(`/v1/admin/tenants/${tenantIdTarget}/timbrados`)
      .set('X-API-Key', adminKey)
      .send(payload)
    expect(res1.status).toBe(201)

    // Segunda creación con mismos datos → conflicto
    const res2 = await supertest(app.server)
      .post(`/v1/admin/tenants/${tenantIdTarget}/timbrados`)
      .set('X-API-Key', adminKey)
      .send(payload)

    expect(res2.status).toBe(409)
    expect(res2.body.error).toBe('Conflict')
  })

  it('retorna 404 al crear timbrado para tenant inexistente', async () => {
    const idFalso = 'aaaaaaaa-0000-0000-dddd-ffffffffffff'
    const res = await supertest(app.server)
      .post(`/v1/admin/tenants/${idFalso}/timbrados`)
      .set('X-API-Key', adminKey)
      .send({
        numero: '11111111',
        establecimiento: '001',
        puntoExpedicion: '001',
        tipoDocumento: 1,
        fechaInicio: '2024-01-01',
      })

    expect(res.status).toBe(404)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// PUT /v1/admin/tenants/:tenantId/timbrados/:timbradoId
// ──────────────────────────────────────────────────────────────────────────────

describe('PUT /v1/admin/tenants/:tenantId/timbrados/:timbradoId', () => {
  let app: FastifyInstance
  let adminKey: string
  let tenantIdTarget: string
  let timbradoIdExistente: string

  beforeAll(async () => {
    const prisma = getPrisma()
    const ctx = await crearAdminKey(prisma)
    adminKey = ctx.adminKey
    tenantIdTarget = ctx.tenantId
    app = await buildTestApp(prisma)
    await app.ready()

    // Crear timbrado para actualizar
    const res = await supertest(app.server)
      .post(`/v1/admin/tenants/${tenantIdTarget}/timbrados`)
      .set('X-API-Key', adminKey)
      .send({
        numero: '55555555',
        establecimiento: '001',
        puntoExpedicion: '001',
        tipoDocumento: 1,
        fechaInicio: '2024-01-01',
      })
    timbradoIdExistente = (res.body as { id: string }).id
  })

  afterAll(async () => {
    await app.close()
  })

  it('actualiza el timbrado y retorna los datos nuevos', async () => {
    const res = await supertest(app.server)
      .put(`/v1/admin/tenants/${tenantIdTarget}/timbrados/${timbradoIdExistente}`)
      .set('X-API-Key', adminKey)
      .send({ activo: false })

    expect(res.status).toBe(200)
    expect(res.body.activo).toBe(false)
  })

  it('retorna 404 al actualizar timbrado inexistente (P2025)', async () => {
    const idFalso = 'aaaaaaaa-1111-2222-3333-eeeeeeeeeeee'
    const res = await supertest(app.server)
      .put(`/v1/admin/tenants/${tenantIdTarget}/timbrados/${idFalso}`)
      .set('X-API-Key', adminKey)
      .send({ activo: false })

    expect(res.status).toBe(404)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// GET /v1/admin/tenants/:tenantId/api-keys
// ──────────────────────────────────────────────────────────────────────────────

describe('GET /v1/admin/tenants/:tenantId/api-keys', () => {
  let app: FastifyInstance
  let adminKey: string
  let tenantIdTarget: string

  beforeAll(async () => {
    const prisma = getPrisma()
    const ctx = await crearAdminKey(prisma)
    adminKey = ctx.adminKey
    tenantIdTarget = ctx.tenantId
    app = await buildTestApp(prisma)
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('lista API keys del tenant sin exponer el hash', async () => {
    const res = await supertest(app.server)
      .get(`/v1/admin/tenants/${tenantIdTarget}/api-keys`)
      .set('X-API-Key', adminKey)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)

    if (res.body.length > 0) {
      const key = res.body[0] as Record<string, unknown>
      expect(key).toHaveProperty('id')
      expect(key).toHaveProperty('nombre')
      expect(key).toHaveProperty('activa')
      expect(key).toHaveProperty('isAdmin')
      // El hash nunca debe exponerse
      expect(key).not.toHaveProperty('hash')
    }
  })
})
