import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { env } from './config/env.js'
import { errorHandler } from './middleware/error-handler.js'

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'test' ? 'silent' : 'info',
      transport:
        env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
  })

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
    keyGenerator: (request) =>
      (request.headers['x-api-key'] as string) ?? request.ip,
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
      tags: [
        { name: 'Documentos', description: 'Emisión y consulta de Documentos Electrónicos' },
        { name: 'Eventos', description: 'Cancelación, inutilización y conformidades' },
        { name: 'Lotes', description: 'Envío batch asíncrono de DEs' },
        { name: 'Consultas', description: 'Consulta de RUC y estado de DEs' },
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

  // Healthcheck
  app.get('/health', { schema: { hide: true } }, async () => ({
    status: 'ok',
    ambiente: env.SIFEN_AMBIENTE,
    timestamp: new Date().toISOString(),
  }))

  // Routes v1
  await app.register(
    async (v1) => {
      // Se registrarán los routers aquí
      // await v1.register(documentosRoutes, { prefix: '/documentos' })
      // await v1.register(eventosRoutes, { prefix: '/eventos' })
      // await v1.register(lotesRoutes, { prefix: '/lotes' })
      // await v1.register(consultasRoutes, { prefix: '/consultas' })
    },
    { prefix: '/v1' },
  )

  return app
}
