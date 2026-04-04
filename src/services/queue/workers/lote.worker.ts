import type { Job } from 'bullmq'
import type { PrismaClient } from '@prisma/client'
import type { SifenSoapClient } from '../../sifen/soap.client.js'
import type { LoteDeJobData } from '../bull.js'

/**
 * Procesador del worker de lotes.
 * Envía hasta 50 DEs de forma asíncrona a SIFEN y actualiza el estado en DB.
 *
 * Se ejecuta en background vía BullMQ — no bloquea el hilo principal.
 */
export function crearProcesadorLote(prisma: PrismaClient, soapClient: SifenSoapClient) {
  return async function procesarLote(job: Job<LoteDeJobData>): Promise<void> {
    const { tenantId, xmlsDe, idLote, loteId } = job.data

    job.log(`Procesando lote ${loteId}: ${xmlsDe.length} documentos`)

    const respuesta = await soapClient.recibirLote(xmlsDe, idLote)

    if (!respuesta.ok) {
      // BullMQ reintentará según la config de backoff
      throw new Error(`SIFEN rechazó el lote: ${respuesta.error ?? 'error desconocido'}`)
    }

    // Extraer número de protocolo de la respuesta XML
    // El protocolo viene en <dProtConsLote> o <nroProtocolo> según versión SIFEN
    const nroProtocolo = extraerProtocoloDeRespuesta(respuesta.data ?? '')

    // Actualizar todos los documentos del lote con el protocolo para consulta posterior
    if (nroProtocolo) {
      await prisma.documentoElectronico.updateMany({
        where: {
          tenantId,
          estado: 'PENDIENTE',
          nroProtocolo: null,
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

    job.log(`Lote ${loteId} procesado. Protocolo: ${nroProtocolo ?? 'N/A'}`)
  }
}

function extraerProtocoloDeRespuesta(xml: string): string | null {
  const match = xml.match(/<dProtConsLote>(\w+)<\/dProtConsLote>/) ??
                xml.match(/<nroProtocolo>(\w+)<\/nroProtocolo>/)
  return match?.[1] ?? null
}
