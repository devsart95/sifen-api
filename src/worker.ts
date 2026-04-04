/**
 * Worker entry point — ejecutado por el servicio `worker` en docker-compose.prod.yml
 * como `node dist/worker.js`. Procesa colas BullMQ de forma independiente al servidor HTTP.
 */
import { PrismaClient } from '@prisma/client'
import { env } from './config/env.js'
import { SifenSoapClient } from './services/sifen/soap.client.js'
import { crearLoteDeWorker, crearKudePdfWorker } from './services/queue/bull.js'
import { crearProcesadorLote } from './services/queue/workers/lote.worker.js'
import { crearProcesadorKude } from './services/queue/workers/kude.worker.js'

const prisma = new PrismaClient()
const soapClient = new SifenSoapClient(env.SIFEN_AMBIENTE)

const loteWorker = crearLoteDeWorker(crearProcesadorLote(prisma, soapClient))
const kudeWorker = crearKudePdfWorker(crearProcesadorKude(prisma))

loteWorker.on('completed', (job) => {
  console.log(`[lote-worker] job ${job.id} completado`)
})
loteWorker.on('failed', (job, err) => {
  console.error(`[lote-worker] job ${job?.id} falló:`, err.message)
})

kudeWorker.on('completed', (job) => {
  console.log(`[kude-worker] job ${job.id} completado`)
})
kudeWorker.on('failed', (job, err) => {
  console.error(`[kude-worker] job ${job?.id} falló:`, err.message)
})

async function shutdown() {
  console.log('Worker: shutdown solicitado')
  await loteWorker.close()
  await kudeWorker.close()
  await prisma.$disconnect()
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

console.log(`Worker iniciado. Ambiente: ${env.SIFEN_AMBIENTE}`)
