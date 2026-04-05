import type { Job } from 'bullmq'
import type { PrismaClient } from '@prisma/client'
import type { SifenSoapClient } from '../../sifen/soap.client.js'
import type { LoteDeJobData } from '../bull.js'
import { dispararWebhook } from '../../webhook/dispatcher.js'
import { WEBHOOK_EVENTOS } from '../../webhook/types.js'

/**
 * Procesador del worker de lotes.
 * Envía hasta 50 DEs de forma asíncrona a SIFEN y actualiza el estado en DB.
 *
 * Recibe `getSoapClient` en lugar de una instancia fija para usar el cert correcto
 * por tenant en la conexión mTLS con SIFEN (multi-tenant v0.3).
 */
export function crearProcesadorLote(
  prisma: PrismaClient,
  getSoapClient: (tenantId: string) => Promise<SifenSoapClient>,
) {
  return async function procesarLote(job: Job<LoteDeJobData>): Promise<void> {
    const { tenantId, xmlsDe, cdcs, idLote, loteId } = job.data

    job.log(`Procesando lote ${loteId}: ${xmlsDe.length} documentos`)

    // Obtener el cliente SOAP con el cert correcto para el tenant
    const soapClient = await getSoapClient(tenantId)
    const respuesta = await soapClient.recibirLote(xmlsDe, idLote)

    if (!respuesta.ok) {
      // BullMQ reintentará según la config de backoff
      throw new Error(`SIFEN rechazó el lote: ${respuesta.error ?? 'error desconocido'}`)
    }

    // Extraer número de protocolo de la respuesta XML
    const nroProtocolo = extraerProtocoloDeRespuesta(respuesta.data ?? '')

    // Actualizar los documentos específicos del lote (scoped por CDCs del job)
    if (nroProtocolo && cdcs.length > 0) {
      await prisma.documentoElectronico.updateMany({
        where: {
          tenantId,
          cdc: { in: cdcs },
          estado: 'PENDIENTE',
        },
        data: {
          estado: 'ENVIADO',
          nroProtocolo,
        },
      })
    }

    await prisma.auditLog.create({
      data: {
        tenantId,
        accion: 'ENVIO_LOTE',
        exitoso: true,
        mensaje: `Lote ${loteId} enviado. Protocolo: ${nroProtocolo ?? 'sin protocolo'}`,
        detalles: { cantidadDes: xmlsDe.length, nroProtocolo },
      },
    })

    // Notificar via webhook que el lote fue completado por SIFEN
    void dispararWebhook(prisma, tenantId, WEBHOOK_EVENTOS.LOTE_COMPLETADO, {
      loteId, jobId: job.id, cantidadDocumentos: xmlsDe.length, cdcs, nroProtocolo,
    })

    job.log(`Lote ${loteId} procesado. Protocolo: ${nroProtocolo ?? 'N/A'}`)
  }
}

function extraerProtocoloDeRespuesta(xml: string): string | null {
  const match = xml.match(/<dProtConsLote>(\w+)<\/dProtConsLote>/) ??
                xml.match(/<nroProtocolo>(\w+)<\/nroProtocolo>/)
  return match?.[1] ?? null
}
