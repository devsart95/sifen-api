import Fastify from 'fastify'
import { validatorCompiler } from 'fastify-type-provider-zod'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { PrismaClient } from '@prisma/client'
import { env } from './config/env.js'
import { errorHandler } from './middleware/error-handler.js'
import { SifenSoapClient } from './services/sifen/soap.client.js'
import { CertificateManagerImpl } from './services/certificate/manager.js'
import type { CertificateManager } from './services/certificate/types.js'
import { documentosRoutes } from './routes/v1/documentos/index.js'
import { eventosRoutes } from './routes/v1/eventos/index.js'
import { consultasRoutes } from './routes/v1/consultas/index.js'
import { lotesRoutes } from './routes/v1/lotes/index.js'
import { adminRoutes } from './routes/v1/admin/index.js'
import { crearIdempotencyPlugin } from './middleware/idempotency.js'
import { hashApiKey } from './middleware/auth.js'

export interface AppDeps {
  prisma?: PrismaClient
  soapClient?: SifenSoapClient
  certManager?: CertificateManager
}

export async function buildApp(deps: AppDeps = {}) {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'test' ? 'silent' : 'info',
      transport:
        env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
    // Límite explícito de payload: 2MB es suficiente para lotes de 50 DEs
    bodyLimit: 2 * 1024 * 1024,
  })

  // Validator Zod — permite usar schemas Zod directamente como body/params/query
  // No usamos serializerCompiler para mantener JSON schema plano en las responses
  app.setValidatorCompiler(validatorCompiler)

  // Dependencias — inyectables para tests, instanciadas por defecto en producción
  const prisma = deps.prisma ?? new PrismaClient()
  const certManager = deps.certManager ?? new CertificateManagerImpl(prisma)

  const globalSoapClient =
    deps.soapClient ?? new SifenSoapClient(env.SIFEN_AMBIENTE)

  /**
   * Caché de promesas — previene race condition bajo concurrencia simultánea.
   * Dos requests del mismo tenant que lleguen en el mismo ms comparten la misma Promise.
   * Cuando un tenant sube cert nuevo vía admin API, la entrada se elimina del caché.
   */
  const soapClientCache = new Map<string, Promise<SifenSoapClient>>()

  /**
   * Retorna el SifenSoapClient correcto para el tenant.
   * Prioridad: cert en DB → cert global en env vars → sin cert (solo lectura/consulta)
   */
  function getSoapClient(tenantId: string): Promise<SifenSoapClient> {
    const cached = soapClientCache.get(tenantId)
    if (cached) return cached

    const promise = (async (): Promise<SifenSoapClient> => {
      try {
        const tenant = await prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { certEncriptado: true },
        })
        if (tenant?.certEncriptado) {
          const cert = await certManager.obtenerCert(tenantId)
          return new SifenSoapClient(env.SIFEN_AMBIENTE, {
            pfx: cert.p12Buffer,
            passphrase: cert.passphrase,
          })
        }
      } catch {
        // No hay cert en DB — usar el global
      }
      return globalSoapClient
    })()

    soapClientCache.set(tenantId, promise)
    return promise
  }

  // Seguridad
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
      },
    },
  })

  await app.register(cors, {
    origin: env.NODE_ENV === 'production' ? false : true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  })

  // Caché en memoria para per-tenant rate limit: evita DB lookup en cada request
  const rateLimitCache = new Map<string, { max: number; cachedAt: number }>()
  const RATE_LIMIT_TTL_MS = 60_000 // 1 minuto

  await app.register(rateLimit, {
    max: async (request) => {
      const rawKey = request.headers['x-api-key']
      if (!rawKey) return env.RATE_LIMIT_MAX
      const keyStr = Array.isArray(rawKey) ? (rawKey[0] ?? '') : rawKey
      if (!keyStr) return env.RATE_LIMIT_MAX

      const cached = rateLimitCache.get(keyStr)
      if (cached && Date.now() - cached.cachedAt < RATE_LIMIT_TTL_MS) {
        return cached.max
      }

      try {
        const record = await prisma.apiKey.findUnique({
          where: { hash: hashApiKey(keyStr) },
          select: { tenant: { select: { rateLimitMax: true } } },
        })
        const max = record?.tenant?.rateLimitMax ?? env.RATE_LIMIT_MAX
        rateLimitCache.set(keyStr, { max, cachedAt: Date.now() })
        return max
      } catch {
        return env.RATE_LIMIT_MAX
      }
    },
    timeWindow: env.RATE_LIMIT_WINDOW,
    keyGenerator: (request) => {
      const apiKey = request.headers['x-api-key']
      if (Array.isArray(apiKey)) return apiKey[0] ?? request.ip
      return apiKey ?? request.ip
    },
  })

  // OpenAPI / Swagger — deshabilitado en producción (expone esquemas internos)
  if (env.NODE_ENV !== 'production') await app.register(swagger, {
    openapi: {
      info: {
        title: 'sifen-api',
        description:
          'REST API gateway para SIFEN Paraguay — facturación electrónica sin SOAP',
        version: '0.3.0',
        contact: {
          name: 'DevSar',
          url: 'https://github.com/devsart95/sifen-api',
        },
        license: { name: 'MIT' },
      },
      components: {
        securitySchemes: {
          ApiKeyAuth: {
            type: 'apiKey',
            in: 'header',
            name: 'X-API-Key',
          },
        },
      },
      security: [{ ApiKeyAuth: [] }],
      tags: [
        { name: 'Documentos', description: 'Emisión y consulta de Documentos Electrónicos' },
        { name: 'Eventos', description: 'Cancelación, inutilización y conformidades' },
        { name: 'Lotes', description: 'Envío batch asíncrono de DEs (hasta 50)' },
        { name: 'Consultas', description: 'Consulta de RUC y estado de lotes' },
        { name: 'Admin', description: 'Gestión de tenants, API keys, timbrados y certificados' },
        { name: 'Salud', description: 'Healthcheck y estado del servicio' },
      ],
    },
  })

  if (env.NODE_ENV !== 'production') {
    await app.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: { docExpansion: 'list', deepLinking: true },
    })
  }

  // Error handler global
  app.setErrorHandler(errorHandler)

  // Graceful shutdown
  app.addHook('onClose', async () => {
    await prisma.$disconnect()
  })

  // ─── Métricas Prometheus (opcional) ──────────────────────────────────────────
  if (env.METRICS_ENABLED) {
    const { registry, httpDuration } = await import('./services/metrics/index.js')

    // Medir duración de cada request HTTP
    app.addHook('onRequest', (request, _reply, done) => {
      request.metricsInicio = Date.now()
      done()
    })
    app.addHook('onResponse', (request, reply, done) => {
      const dur = (Date.now() - (request.metricsInicio ?? Date.now())) / 1000
      const route = request.routeOptions?.url ?? request.url.split('?')[0] ?? 'unknown'
      httpDuration.observe(
        { method: request.method, route, statusCode: String(reply.statusCode) },
        dur,
      )
      done()
    })

    app.get('/metrics', async (_, reply) => {
      const metrics = await registry.metrics()
      return reply
        .header('Content-Type', registry.contentType)
        .send(metrics)
    })
  }

  // ─── Healthchecks ────────────────────────────────────────────────────────────

  app.get(
    '/health',
    {
      schema: {
        tags: ['Salud'],
        summary: 'Liveness probe',
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              ambiente: { type: 'string' },
              timestamp: { type: 'string' },
            },
          },
        },
      },
    },
    async () => ({
      status: 'ok',
      ambiente: env.SIFEN_AMBIENTE,
      timestamp: new Date().toISOString(),
    }),
  )

  app.get(
    '/health/ready',
    {
      schema: {
        tags: ['Salud'],
        summary: 'Readiness probe — verifica DB, Redis y certificado',
      },
    },
    async (_, reply) => {
      const checks: Record<string, string> = {}
      let allOk = true

      // DB
      try {
        await prisma.$queryRaw`SELECT 1`
        checks['db'] = 'ok'
      } catch {
        checks['db'] = 'error'
        allOk = false
      }

      // Certificado — global o en DB
      try {
        const { existsSync } = await import('node:fs')
        if (env.SIFEN_CERT_PATH && existsSync(env.SIFEN_CERT_PATH)) {
          checks['cert'] = 'ok (global)'
        } else {
          // Verificar si algún tenant tiene cert en DB
          const conCert = await prisma.tenant.count({
            where: { certEncriptado: { not: null } },
          })
          checks['cert'] = conCert > 0 ? `ok (${conCert} tenants)` : 'no configurado'
        }
      } catch {
        checks['cert'] = 'error'
        allOk = false
      }

      // Circuit breaker de SIFEN
      checks['sifen_circuit'] = globalSoapClient.circuitEstado

      const status = allOk ? 200 : 503
      return reply.status(status).send({
        status: allOk ? 'ready' : 'degraded',
        checks,
        timestamp: new Date().toISOString(),
      })
    },
  )

  // ─── Routes v1 ───────────────────────────────────────────────────────────────
  await app.register(
    async (v1) => {
      // Idempotencia para endpoints de mutación
      await v1.register(crearIdempotencyPlugin(prisma))

      await v1.register(documentosRoutes, {
        prefix: '/documentos',
        prisma,
        getSoapClient,
        certManager,
      })
      await v1.register(eventosRoutes, {
        prefix: '/eventos',
        prisma,
        getSoapClient,
        certManager,
      })
      await v1.register(consultasRoutes, {
        prefix: '/consultas',
        prisma,
        getSoapClient,
      })
      await v1.register(lotesRoutes, {
        prefix: '/lotes',
        prisma,
        certManager,
      })
      await v1.register(adminRoutes, {
        prefix: '/admin',
        prisma,
        certManager,
        onCertActualizado: (tenantId: string) => {
          soapClientCache.delete(tenantId)
        },
      })
    },
    { prefix: '/v1' },
  )

  return app
}
