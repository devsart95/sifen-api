import { Queue, Worker, type Job } from 'bullmq'
import { env } from '../../config/env.js'

// Nombres de colas
export const QUEUE_NAMES = {
  LOTE_DE: 'lote-de',
  KUDE_PDF: 'kude-pdf',
  WEBHOOK: 'webhook-delivery',
} as const

// ─── Tipos de jobs ────────────────────────────────────────────────────────────

export interface LoteDeJobData {
  tenantId: string
  loteId: string           // ID de registro en DB para tracking
  xmlsDe: string[]         // XMLs firmados listos para enviar
  cdcs: string[]           // CDCs correspondientes a cada XML (mismo orden)
  idLote: number
}

export interface KudePdfJobData {
  tenantId: string
  documentoId: string
  cdc: string
  xmlFirmado: string
}

// Tipo canónico en webhook/types.ts — importado para usar en Queue/Worker y re-exportado
import type { WebhookJobData } from '../webhook/types.js'
export type { WebhookJobData } from '../webhook/types.js'

// ─── Conexión lazy ────────────────────────────────────────────────────────────

function getConnection() {
  if (!env.REDIS_URL) {
    throw new Error('Redis no disponible: REDIS_URL no configurado. Los lotes y webhooks requieren Redis.')
  }
  return { url: env.REDIS_URL }
}

// ─── Colas lazy (instanciadas al primer uso) ──────────────────────────────────

let _loteDeQueue: Queue<LoteDeJobData> | null = null
let _kudePdfQueue: Queue<KudePdfJobData> | null = null
let _webhookQueue: Queue<WebhookJobData> | null = null

export function getLoteDeQueue(): Queue<LoteDeJobData> {
  if (!_loteDeQueue) {
    _loteDeQueue = new Queue<LoteDeJobData>(QUEUE_NAMES.LOTE_DE, {
      connection: getConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5_000,   // 5s, 10s, 20s
        },
        removeOnComplete: { age: 86_400 },    // conservar 24h
        removeOnFail: { age: 7 * 86_400 },    // conservar 7 días para diagnóstico
      },
    })
  }
  return _loteDeQueue
}

export function getKudePdfQueue(): Queue<KudePdfJobData> {
  if (!_kudePdfQueue) {
    _kudePdfQueue = new Queue<KudePdfJobData>(QUEUE_NAMES.KUDE_PDF, {
      connection: getConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'fixed', delay: 3_000 },
        removeOnComplete: { age: 3_600 },     // 1h (el PDF ya fue guardado)
        removeOnFail: { age: 86_400 },
      },
    })
  }
  return _kudePdfQueue
}

export function getWebhookQueue(): Queue<WebhookJobData> {
  if (!_webhookQueue) {
    _webhookQueue = new Queue<WebhookJobData>(QUEUE_NAMES.WEBHOOK, {
      connection: getConnection(),
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 10_000,  // 10s, 20s, 40s, 80s, 160s
        },
        removeOnComplete: { age: 86_400 },
        removeOnFail: { age: 7 * 86_400 },
      },
    })
  }
  return _webhookQueue
}

// ─── Factory de workers ───────────────────────────────────────────────────────

/**
 * Crea el worker del lote con la función procesadora inyectada.
 * El procesador se define en lote.worker.ts para mantener separación de concerns.
 */
export function crearLoteDeWorker(
  procesador: (job: Job<LoteDeJobData>) => Promise<void>,
): Worker<LoteDeJobData> {
  return new Worker<LoteDeJobData>(QUEUE_NAMES.LOTE_DE, procesador, {
    connection: getConnection(),
    concurrency: 3,   // máx 3 lotes procesándose en paralelo
  })
}

export function crearKudePdfWorker(
  procesador: (job: Job<KudePdfJobData>) => Promise<void>,
): Worker<KudePdfJobData> {
  return new Worker<KudePdfJobData>(QUEUE_NAMES.KUDE_PDF, procesador, {
    connection: getConnection(),
    concurrency: 2,
  })
}

export function crearWebhookWorker(
  procesador: (job: Job<WebhookJobData>) => Promise<void>,
): Worker<WebhookJobData> {
  return new Worker<WebhookJobData>(QUEUE_NAMES.WEBHOOK, procesador, {
    connection: getConnection(),
    concurrency: 5,
  })
}
