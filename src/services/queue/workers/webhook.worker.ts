import type { Job } from 'bullmq'
import type { PrismaClient } from '@prisma/client'
import axios from 'axios'
import { firmarPayload } from '../../webhook/signature.js'
import type { WebhookJobData, WebhookPayload } from '../../webhook/types.js'

const TIMEOUT_MS = 10_000

/**
 * Procesa una entrega de webhook con HTTP POST firmado.
 *
 * Flujo:
 *  1. POST al webhookUrl con el payload JSON
 *  2. Header X-Sifen-Signature: sha256=<hmac> para verificación por el receptor
 *  3. Header X-Sifen-Delivery: deliveryId para idempotencia en el receptor
 *  4. Actualiza WebhookDelivery en DB con resultado
 *  5. BullMQ reintenta automáticamente si lanza (hasta 5 veces, exponencial)
 *
 * Estado durante reintentos:
 *  - PENDIENTE mientras queden intentos disponibles
 *  - FALLIDO solo cuando se agotan todos los reintentos
 *  - ENTREGADO en el primer intento exitoso
 */
export function crearProcesadorWebhook(prisma: PrismaClient) {
  return async function procesarWebhook(job: Job<WebhookJobData>): Promise<void> {
    const { webhookUrl, webhookSecret, payload, deliveryId } = job.data
    const webhookPayload = payload as WebhookPayload

    const signature = firmarPayload(webhookPayload, webhookSecret)
    const maxAttempts = job.opts.attempts ?? 5

    let statusCode: number | undefined

    try {
      const response = await axios.post(webhookUrl, payload, {
        timeout: TIMEOUT_MS,
        headers: {
          'Content-Type': 'application/json',
          'X-Sifen-Signature': signature,
          'X-Sifen-Delivery': deliveryId,
          'User-Agent': 'sifen-api-webhook/1.0',
        },
        // 4xx no reintenta (error del receptor), 5xx sí (problema temporal del receptor)
        validateStatus: (status) => status < 500,
      })
      statusCode = response.status

      if (response.status >= 200 && response.status < 300) {
        await prisma.webhookDelivery.update({
          where: { id: deliveryId },
          data: {
            estado: 'ENTREGADO',
            statusCode,
            intentos: job.attemptsMade + 1,
            entregadoEn: new Date(),
            ultimoError: null,
          },
        })
        return
      }

      // 4xx: error del receptor — marcar FALLIDO sin reintentar
      const ultimoError = `HTTP ${response.status}`
      await prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          estado: 'FALLIDO',
          statusCode,
          intentos: job.attemptsMade + 1,
          ultimoError,
        },
      })
      // No lanzar → BullMQ no reintenta
      return
    } catch (err) {
      const ultimoError = err instanceof Error ? err.message : String(err)
      const remainingAttempts = maxAttempts - (job.attemptsMade + 1)

      // Solo marcar FALLIDO cuando se agotaron todos los reintentos
      // Mientras queden reintentos, mantener PENDIENTE con el último error para diagnóstico
      await prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          estado: remainingAttempts > 0 ? 'PENDIENTE' : 'FALLIDO',
          intentos: job.attemptsMade + 1,
          ultimoError,
        },
      })

      // Lanzar para que BullMQ reintente
      throw err
    }
  }
}
