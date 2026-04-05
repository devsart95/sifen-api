/**
 * Worker entry point — ejecutado por el servicio `worker` en docker-compose.prod.yml
 * como `node dist/worker.js`. Procesa colas BullMQ de forma independiente al servidor HTTP.
 */
import pino from 'pino'
import { PrismaClient } from '@prisma/client'
import { env } from './config/env.js'
import { SifenSoapClient } from './services/sifen/soap.client.js'
import { CertificateManagerImpl } from './services/certificate/manager.js'
import { crearLoteDeWorker, crearKudePdfWorker, crearWebhookWorker } from './services/queue/bull.js'
import { crearProcesadorLote } from './services/queue/workers/lote.worker.js'
import { crearProcesadorKude } from './services/queue/workers/kude.worker.js'
import { crearProcesadorWebhook } from './services/queue/workers/webhook.worker.js'

const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : 'info',
  transport:
    env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
})

const prisma = new PrismaClient()
const certManager = new CertificateManagerImpl(prisma)

// Cliente global de fallback — usado cuando el tenant no tiene cert en DB
const globalSoapClient = new SifenSoapClient(env.SIFEN_AMBIENTE)

// Caché de promesas por tenant — idéntico al patrón de app.ts (anti-race condition)
const soapClientCache = new Map<string, Promise<SifenSoapClient>>()

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

const loteWorker = crearLoteDeWorker(crearProcesadorLote(prisma, getSoapClient))
const kudeWorker = crearKudePdfWorker(crearProcesadorKude(prisma))
const webhookWorker = crearWebhookWorker(crearProcesadorWebhook(prisma))

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

webhookWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, '[webhook-worker] entregado')
})
webhookWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, '[webhook-worker] job fallido')
})
webhookWorker.on('error', (err) => {
  logger.error({ err: err.message }, '[webhook-worker] error de conexión')
})

async function shutdown() {
  logger.info('Worker: shutdown solicitado')
  await loteWorker.close()
  await kudeWorker.close()
  await webhookWorker.close()
  await prisma.$disconnect()
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

logger.info({ ambiente: env.SIFEN_AMBIENTE }, 'Worker iniciado')
