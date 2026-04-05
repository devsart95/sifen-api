export const WEBHOOK_EVENTOS = {
  DE_APROBADO: 'de.aprobado',
  DE_RECHAZADO: 'de.rechazado',
  DE_CANCELADO: 'de.cancelado',
  LOTE_ENCOLADO: 'lote.encolado',    // disparado al encolar el lote (202 Accepted)
  LOTE_COMPLETADO: 'lote.completado', // disparado por el worker cuando SIFEN acepta
  EVENTO_ACEPTADO: 'evento.aceptado',
} as const

export type WebhookEventoTipo = (typeof WEBHOOK_EVENTOS)[keyof typeof WEBHOOK_EVENTOS]

export interface WebhookPayload {
  evento: WebhookEventoTipo
  tenantId: string
  timestamp: string       // ISO 8601
  datos: Record<string, unknown>
}

/**
 * Tipo canónico para los jobs de webhook en BullMQ.
 * Definido aquí (no en bull.ts) para evitar duplicados incompatibles.
 */
export interface WebhookJobData {
  tenantId: string
  webhookUrl: string
  webhookSecret: string
  payload: WebhookPayload
  deliveryId: string      // ID del registro WebhookDelivery en DB
}
