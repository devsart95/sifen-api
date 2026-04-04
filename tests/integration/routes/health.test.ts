import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import supertest from 'supertest'
import type { FastifyInstance } from 'fastify'
import { buildTestApp, getPrisma, teardownPrisma } from '../helpers/app.js'

describe('GET /health', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildTestApp(getPrisma())
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
    await teardownPrisma()
  })

  it('retorna 200 con status ok', async () => {
    const res = await supertest(app.server).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
  })

  it('retorna el ambiente SIFEN', async () => {
    const res = await supertest(app.server).get('/health')
    expect(res.body.ambiente).toBe('test')
  })

  it('retorna timestamp ISO válido', async () => {
    const res = await supertest(app.server).get('/health')
    expect(() => new Date(res.body.timestamp as string)).not.toThrow()
  })
})
