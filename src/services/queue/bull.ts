import { Queue, Worker, type Job } from 'bullmq'
import { env } from '../../config/env.js'

// Nombres de colas
export const QUEUE_NAMES = {
  LOTE_DE: 'lote-de',
  KUDE_PDF: 'kude-pdf',
} as const

const connection = {
  url: env.REDIS_URL,
}

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

// ─── Colas ────────────────────────────────────────────────────────────────────

export const loteDeQueue = new Queue<LoteDeJobData>(QUEUE_NAMES.LOTE_DE, {
  connection,
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

export const kudePdfQueue = new Queue<KudePdfJobData>(QUEUE_NAMES.KUDE_PDF, {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 3_000 },
    removeOnComplete: { age: 3_600 },     // 1h (el PDF ya fue guardado)
    removeOnFail: { age: 86_400 },
  },
})

// ─── Factory de workers ───────────────────────────────────────────────────────

/**
 * Crea el worker del lote con la función procesadora inyectada.
 * El procesador se define en lote.worker.ts para mantener separación de concerns.
 */
export function crearLoteDeWorker(
  procesador: (job: Job<LoteDeJobData>) => Promise<void>,
): Worker<LoteDeJobData> {
  return new Worker<LoteDeJobData>(QUEUE_NAMES.LOTE_DE, procesador, {
    connection,
    concurrency: 3,   // máx 3 lotes procesándose en paralelo
  })
}

export function crearKudePdfWorker(
  procesador: (job: Job<KudePdfJobData>) => Promise<void>,
): Worker<KudePdfJobData> {
  return new Worker<KudePdfJobData>(QUEUE_NAMES.KUDE_PDF, procesador, {
    connection,
    concurrency: 2,
  })
}
