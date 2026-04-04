import * as fs from 'node:fs'
import type { FastifyPluginAsync } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import type { SifenSoapClient } from '../../../services/sifen/soap.client.js'
import { EventoSchema } from '../../../schemas/evento.schema.js'
import { firmarXmlDe } from '../../../services/xml/signer.js'
import { crearAuthHook } from '../../../middleware/auth.js'
import { SIFEN_NAMESPACE, TIPO_EVENTO } from '../../../config/constants.js'
import { formatearFechaXml } from '../../../utils/date.js'
import { env } from '../../../config/env.js'

// Certificado leído una sola vez al inicio del módulo (C1)
const p12Buffer = fs.readFileSync(env.SIFEN_CERT_PATH)

interface EventosRouteOptions {
  prisma: PrismaClient
  soapClient: SifenSoapClient
}

export const eventosRoutes: FastifyPluginAsync<EventosRouteOptions> = async (
  fastify,
  opts,
) => {
  const { prisma, soapClient } = opts
  const authHook = crearAuthHook(prisma)

  // ─── POST /v1/eventos — Enviar evento (cancelación, inutilización, conformidad) ──

  fastify.post(
    '/',
    {
      preHandler: authHook,
      schema: {
        tags: ['Eventos'],
        summary: 'Enviar evento SIFEN',
        description:
          'Procesa eventos sobre Documentos Electrónicos: cancelación (tipo 1), ' +
          'inutilización de numeración (tipo 2), conformidad/disconformidad/desconocimiento ' +
          '(tipos 11/12/13) y acuse de recibo (tipo 10).',
        body: EventoSchema,
      },
    },
    async (request, reply) => {
      const evento = EventoSchema.parse(request.body)
      const tenantId = request.tenantId

      // Generar XML del evento según tipo
      const xmlEvento = generarXmlEvento(evento, tenantId)

      // Firmar el evento con el mismo certificado del contribuyente
      const { xmlFirmado } = firmarXmlDe(xmlEvento, {
        p12Buffer,
        passphrase: env.SIFEN_CERT_PASS,
      })

      // Guardar en DB
      const documentoId =
        'cdc' in evento
          ? (
              await prisma.documentoElectronico.findFirst({
                where: { cdc: evento.cdc, tenantId },
                select: { id: true },
              })
            )?.id
          : undefined

      const eventoDb = await prisma.eventoElectronico.create({
        data: {
          tenantId,
          documentoId: documentoId ?? null,
          tipoEvento: evento.tipo,
          estado: 'PENDIENTE',
          motivo: 'motivo' in evento ? evento.motivo : null,
          xmlEvento: xmlFirmado,
        },
      })

      // Enviar a SIFEN
      const respuesta = await soapClient.recibirEvento(xmlFirmado)

      const estadoFinal = respuesta.ok ? 'ACEPTADO' : 'RECHAZADO'

      await prisma.eventoElectronico.update({
        where: { id: eventoDb.id },
        data: {
          estado: estadoFinal,
          xmlRespuesta: respuesta.data ?? respuesta.error,
        },
      })

      // Si es cancelación y fue aceptada, actualizar estado del DE
      if (evento.tipo === TIPO_EVENTO.CANCELACION && respuesta.ok && documentoId) {
        await prisma.documentoElectronico.update({
          where: { id: documentoId },
          data: { estado: 'CANCELADO' },
        })
      }

      // Audit log
      await prisma.auditLog.create({
        data: {
          tenantId,
          accion: evento.tipo === TIPO_EVENTO.CANCELACION ? 'CANCELACION' : 'ENVIO_EVENTO',
          documentoId: documentoId ?? null,
          eventoId: eventoDb.id,
          exitoso: respuesta.ok,
          mensaje: respuesta.ok ? `Evento tipo ${evento.tipo} aceptado` : respuesta.error,
          ip: request.ip,
        },
      })

      if (!respuesta.ok) {
        return reply.status(422).send({
          statusCode: 422,
          error: 'SIFEN rechazó el evento',
          message: respuesta.error ?? 'Error desconocido',
        })
      }

      return reply.status(201).send({
        eventoId: eventoDb.id,
        tipoEvento: evento.tipo,
        estado: estadoFinal,
        xmlRespuesta: respuesta.data,
      })
    },
  )
}

// ─── Generadores de XML por tipo de evento ────────────────────────────────────

function generarXmlEvento(evento: ReturnType<typeof EventoSchema.parse>, _tenantId: string): string {
  const fecha = formatearFechaXml(new Date())

  switch (evento.tipo) {
    case TIPO_EVENTO.CANCELACION:
      return [
        `<?xml version="1.0" encoding="UTF-8"?>`,
        `<rGeVe xmlns="${SIFEN_NAMESPACE}">`,
        `  <dFecFirma>${fecha}</dFecFirma>`,
        `  <rGeVeCan>`,
        `    <Id>${evento.cdc}</Id>`,
        `    <mOtEve>${escapeXml(evento.motivo)}</mOtEve>`,
        `  </rGeVeCan>`,
        `</rGeVe>`,
      ].join('\n')

    case TIPO_EVENTO.INUTILIZACION:
      return [
        `<?xml version="1.0" encoding="UTF-8"?>`,
        `<rGeVe xmlns="${SIFEN_NAMESPACE}">`,
        `  <dFecFirma>${fecha}</dFecFirma>`,
        `  <rGeVeInu>`,
        `    <dNumTim>${evento.timbrado}</dNumTim>`,
        `    <dEst>${evento.establecimiento}</dEst>`,
        `    <dPunExp>${evento.puntoExpedicion}</dPunExp>`,
        `    <dNumIn>${String(evento.numeroInicio).padStart(7, '0')}</dNumIn>`,
        `    <dNumFin>${String(evento.numeroFin).padStart(7, '0')}</dNumFin>`,
        `    <iTiDE>${evento.tipoDocumento}</iTiDE>`,
        `    <mOtEve>${escapeXml(evento.motivo)}</mOtEve>`,
        `  </rGeVeInu>`,
        `</rGeVe>`,
      ].join('\n')

    case TIPO_EVENTO.CONFORMIDAD:
    case TIPO_EVENTO.DISCONFORMIDAD:
    case TIPO_EVENTO.DESCONOCIMIENTO:
    case TIPO_EVENTO.ACUSE_RECIBO:
      return [
        `<?xml version="1.0" encoding="UTF-8"?>`,
        `<rGeVe xmlns="${SIFEN_NAMESPACE}">`,
        `  <dFecFirma>${fecha}</dFecFirma>`,
        `  <rGeVeNovRec>`,
        `    <Id>${evento.cdc}</Id>`,
        `    <iTipoEvento>${evento.tipo}</iTipoEvento>`,
        evento.motivo ? `    <mOtEve>${escapeXml(evento.motivo)}</mOtEve>` : '',
        `  </rGeVeNovRec>`,
        `</rGeVe>`,
      ].filter(Boolean).join('\n')
  }
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
