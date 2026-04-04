import { buildApp } from './app.js'
import { env } from './config/env.js'

const app = await buildApp()

try {
  const address = await app.listen({ port: env.PORT, host: env.HOST })
  app.log.info(`sifen-api escuchando en ${address}`)
  app.log.info(`Ambiente SIFEN: ${env.SIFEN_AMBIENTE}`)
  app.log.info(`OpenAPI docs: ${address}/docs`)
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
