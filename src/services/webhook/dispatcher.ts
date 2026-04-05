import type { PrismaClient } from '@prisma/client'
import { WebhookEstado } from '@prisma/client'
import { getWebhookQueue } from '../queue/bull.js'
import type { WebhookEventoTipo, WebhookPayload } from './types.js'

/**
 * Dispara un webhook para el tenant si tiene webhooks activos.
 * Crea el registro WebhookDelivery y encola el job en BullMQ.
 * Fire-and-forget: no lanza si el tenant no tiene webhook configurado
 * o si Redis no está disponible (REDIS_URL no configurado).
 */
export async function dispararWebhook(
  prisma: PrismaClient,
  tenantId: string,
  evento: WebhookEventoTipo,
  datos: Record<string, unknown>,
): Promise<void> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { webhookUrl: true, webhookSecret: true, webhookActivo: true },
  })

  if (!tenant?.webhookActivo || !tenant.webhookUrl || !tenant.webhookSecret) {
    return
  }

  const payload: WebhookPayload = {
    evento,
    tenantId,
    timestamp: new Date().toISOString(),
    datos,
  }

  const delivery = await prisma.webhookDelivery.create({
    data: {
      tenantId,
      evento,
      payload: payload as object,
      estado: WebhookEstado.PENDIENTE,
    },
  })

  try {
    await getWebhookQueue().add(
      `webhook-${tenantId}-${evento}`,
      {
        tenantId,
        webhookUrl: tenant.webhookUrl,
        webhookSecret: tenant.webhookSecret,
        payload,
        deliveryId: delivery.id,
      },
      { priority: 5 },
    )
  } catch {
    // Redis no disponible — el delivery queda en PENDIENTE en DB para reintento manual
  }
}
