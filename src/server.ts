import { buildApp } from './app.js'
import { env } from './config/env.js'
import { PrismaClient } from '@prisma/client'

// Instancia compartida — se inyecta en buildApp y se reutiliza para el cleanup
const prisma = new PrismaClient()
const app = await buildApp({ prisma })

// ─── Limpieza periódica de registros de idempotencia expirados ────────────────
// Corre cada hora para purgar filas con expiresAt < now()
const cleanupInterval = setInterval(
  async () => {
    try {
      const { count } = await prisma.idempotencyRecord.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      })
      if (count > 0) {
        app.log.info(`Idempotency cleanup: eliminados ${count} registros expirados`)
      }
    } catch (err) {
      app.log.error({ err }, 'Error en cleanup de idempotencia')
    }
  },
  60 * 60 * 1000, // cada hora
)

// Cancelar el interval al cerrar el server para que el proceso termine limpio
app.addHook('onClose', async () => {
  clearInterval(cleanupInterval)
})

try {
  const address = await app.listen({ port: env.PORT, host: env.HOST })
  app.log.info(`sifen-api escuchando en ${address}`)
  app.log.info(`Ambiente SIFEN: ${env.SIFEN_AMBIENTE}`)
  app.log.info(`OpenAPI docs: ${address}/docs`)
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
