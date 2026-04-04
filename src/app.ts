import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { PrismaClient } from '@prisma/client'
import { env } from './config/env.js'
import { errorHandler } from './middleware/error-handler.js'
import { SifenSoapClient } from './services/sifen/soap.client.js'
import { documentosRoutes } from './routes/v1/documentos/index.js'
import { eventosRoutes } from './routes/v1/eventos/index.js'
import { consultasRoutes } from './routes/v1/consultas/index.js'
import { lotesRoutes } from './routes/v1/lotes/index.js'

export interface AppDeps {
  prisma?: PrismaClient
  soapClient?: SifenSoapClient
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
  })

  // Dependencias — inyectables para tests, instanciadas por defecto en producción
  const prisma = deps.prisma ?? new PrismaClient()
  const soapClient = deps.soapClient ?? new SifenSoapClient(env.SIFEN_AMBIENTE)

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

  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
    keyGenerator: (request) => {
      const apiKey = request.headers['x-api-key']
      if (Array.isArray(apiKey)) return apiKey[0] ?? request.ip
      return apiKey ?? request.ip
    },
  })

  // OpenAPI / Swagger
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'sifen-api',
        description:
          'REST API gateway para SIFEN Paraguay — facturación electrónica sin SOAP',
        version: '0.1.0',
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
        { name: 'Salud', description: 'Healthcheck y estado del servicio' },
      ],
    },
  })

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
  })

  // Error handler global
  app.setErrorHandler(errorHandler)

  // Graceful shutdown
  app.addHook('onClose', async () => {
    await prisma.$disconnect()
  })

  // Healthcheck
  app.get(
    '/health',
    {
      schema: {
        tags: ['Salud'],
        summary: 'Healthcheck',
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

  // Routes v1
  await app.register(
    async (v1) => {
      await v1.register(documentosRoutes, { prefix: '/documentos', prisma, soapClient })
      await v1.register(eventosRoutes, { prefix: '/eventos', prisma, soapClient })
      await v1.register(consultasRoutes, { prefix: '/consultas', prisma, soapClient })
      await v1.register(lotesRoutes, { prefix: '/lotes', prisma })
    },
    { prefix: '/v1' },
  )

  return app
}
