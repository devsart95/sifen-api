/**
 * Worker entry point — ejecutado por el servicio `worker` en docker-compose.prod.yml
 * como `node dist/worker.js`. Procesa colas BullMQ de forma independiente al servidor HTTP.
 */
import pino from 'pino'
import { PrismaClient } from '@prisma/client'
import { env } from './config/env.js'
import { SifenSoapClient } from './services/sifen/soap.client.js'
import { crearLoteDeWorker, crearKudePdfWorker } from './services/queue/bull.js'
import { crearProcesadorLote } from './services/queue/workers/lote.worker.js'
import { crearProcesadorKude } from './services/queue/workers/kude.worker.js'

const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : 'info',
  transport:
    env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
})

const prisma = new PrismaClient()
const soapClient = new SifenSoapClient(env.SIFEN_AMBIENTE)

const loteWorker = crearLoteDeWorker(crearProcesadorLote(prisma, soapClient))
const kudeWorker = crearKudePdfWorker(crearProcesadorKude(prisma))

loteWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, '[lote-worker] job completado')
})
loteWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, '[lote-worker] job fallido')
})
loteWorker.on('error', (err) => {
  logger.error({ err: err.message }, '[lote-worker] error de conexión')
})

kudeWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, '[kude-worker] job completado')
})
kudeWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, '[kude-worker] job fallido')
})
kudeWorker.on('error', (err) => {
  logger.error({ err: err.message }, '[kude-worker] error de conexión')
})

async function shutdown() {
  logger.info('Worker: shutdown solicitado')
  await loteWorker.close()
  await kudeWorker.close()
  await prisma.$disconnect()
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

logger.info({ ambiente: env.SIFEN_AMBIENTE }, 'Worker iniciado')
