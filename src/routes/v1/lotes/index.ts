import { randomInt } from 'node:crypto'
import type { FastifyPluginAsync } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import type { CertificateManager } from '../../../services/certificate/types.js'
import { z } from 'zod'
import { EmitirDeSchema } from '../../../schemas/de.schema.js'
import { generarXmlDe } from '../../../services/xml/generator.js'
import { firmarXmlDe } from '../../../services/xml/signer.js'
import { getLoteDeQueue } from '../../../services/queue/bull.js'
import { crearAuthHook } from '../../../middleware/auth.js'
import { LIMITES } from '../../../config/constants.js'
import { reservarNumeros } from '../../../services/secuencia.js'
import { dispararWebhook } from '../../../services/webhook/dispatcher.js'
import { WEBHOOK_EVENTOS } from '../../../services/webhook/types.js'

const LoteSchema = z.object({
  documentos: z
    .array(EmitirDeSchema)
    .min(1, 'El lote debe tener al menos 1 documento')
    .max(LIMITES.MAX_DES_POR_LOTE, `El lote no puede superar ${LIMITES.MAX_DES_POR_LOTE} documentos`),
})

interface LotesRouteOptions {
  prisma: PrismaClient
  certManager: CertificateManager
}

export const lotesRoutes: FastifyPluginAsync<LotesRouteOptions> = async (fastify, opts) => {
  const { prisma, certManager } = opts
  const authHook = crearAuthHook(prisma)

  // ─── POST /v1/lotes — Enviar lote asíncrono ───────────────────────────────

  fastify.post(
    '/',
    {
      preHandler: authHook,
      schema: {
        tags: ['Lotes'],
        summary: 'Enviar lote de DEs (hasta 50)',
        description:
          'Encola el envío asíncrono de un lote de Documentos Electrónicos. ' +
          'Retorna inmediatamente con un `loteId` para consultar el estado. ' +
          'El procesamiento real ocurre en background vía BullMQ.',
        body: LoteSchema,
      },
    },
    async (request, reply) => {
      const { documentos } = LoteSchema.parse(request.body)
      const tenantId = request.tenantId
      const cert = await certManager.obtenerCert(tenantId)

      // Reservar N números de forma atómica para todos los docs del lote
      // Se necesita agrupación por timbrado — simplificamos asumiendo 1 timbrado por lote
      // (limitación conocida: lotes multi-timbrado requerirían agrupación adicional)
      const primerDoc = documentos[0]
      const timbradoReferencia = primerDoc
        ? await prisma.timbrado.findFirst({
            where: {
              tenantId,
              numero: primerDoc.timbrado.numero,
              establecimiento: primerDoc.timbrado.establecimiento,
              puntoExpedicion: primerDoc.timbrado.puntoExpedicion,
              tipoDocumento: primerDoc.tipoDocumento,
              activo: true,
            },
          })
        : null

      if (!timbradoReferencia) {
        return reply.status(422).send({
          statusCode: 422,
          error: 'Timbrado no encontrado',
          message: `No se encontró un timbrado activo para número ${primerDoc?.timbrado.numero ?? '?'} del tenant`,
        })
      }

      const numeros = await reservarNumeros(prisma, timbradoReferencia.id, tenantId, documentos.length)

      // Generar y firmar todos los XMLs
      const xmlsFirmados: string[] = []
      const cdcs: string[] = []

      for (let i = 0; i < documentos.length; i++) {
        const input = documentos[i]!
        const numero = numeros[i]
        if (numero === undefined) throw new Error(`Sin número para documento ${i}`)
        const { xml, cdc } = generarXmlDe(input, numero)
        const { xmlFirmado } = firmarXmlDe(xml, {
          p12Buffer: cert.p12Buffer,
          passphrase: cert.passphrase,
        })
        xmlsFirmados.push(xmlFirmado)
        cdcs.push(cdc)
      }


      // Encolar el lote — requiere Redis
      let job: Awaited<ReturnType<ReturnType<typeof getLoteDeQueue>['add']>>
      try {
        job = await getLoteDeQueue().add(
          `lote-${tenantId}-${Date.now()}`,
          {
            tenantId,
            loteId: `lote-${Date.now()}`,
            xmlsDe: xmlsFirmados,
            cdcs,
            idLote: randomInt(1, 100_000),
          },
          { priority: 1 },
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('REDIS_URL')) {
          return reply.status(503).send({
            statusCode: 503,
            error: 'Service Unavailable',
            message: 'El procesamiento asíncrono de lotes requiere Redis. Configure REDIS_URL para usar este endpoint.',
          })
        }
        throw err
      }

      // Log de inicio
      await prisma.auditLog.create({
        data: {
          tenantId,
          accion: 'ENVIO_LOTE',
          exitoso: true,
          mensaje: `Lote encolado con ${documentos.length} documentos`,
          detalles: { jobId: job.id, cdcs },
          ip: request.ip,
        },
      })

      // Notificar al enqueue — el worker dispara LOTE_COMPLETADO cuando SIFEN acepta
      void dispararWebhook(prisma, tenantId, WEBHOOK_EVENTOS.LOTE_ENCOLADO, {
        jobId: job.id, cantidadDocumentos: documentos.length, cdcs,
      })

      return reply.status(202).send({
        jobId: job.id,
        cantidadDocumentos: documentos.length,
        cdcs,
        mensaje: 'Lote encolado para procesamiento. Consultar estado con el jobId.',
        estado: 'ENCOLADO',
      })
    },
  )

  // ─── GET /v1/lotes/:jobId — Consultar estado del job ─────────────────────

  fastify.get(
    '/:jobId',
    {
      preHandler: authHook,
      schema: {
        tags: ['Lotes'],
        summary: 'Consultar estado de un job de lote',
        params: {
          type: 'object',
          properties: { jobId: { type: 'string' } },
          required: ['jobId'],
        },
      },
    },
    async (request, reply) => {
      const { jobId } = request.params as { jobId: string }

      let job: Awaited<ReturnType<ReturnType<typeof getLoteDeQueue>['getJob']>>
      try {
        job = await getLoteDeQueue().getJob(jobId)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('REDIS_URL')) {
          return reply.status(503).send({
            statusCode: 503,
            error: 'Service Unavailable',
            message: 'La consulta de estado de lotes requiere Redis. Configure REDIS_URL.',
          })
        }
        throw err
      }
      if (!job) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `No se encontró el job con ID: ${jobId}`,
        })
      }

      // Verificar que el job pertenece al tenant autenticado (M3)
      if (job.data.tenantId !== request.tenantId) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `No se encontró el job con ID: ${jobId}`,
        })
      }

      const state = await job.getState()
      const progress = job.progress

      return reply.send({
        jobId,
        estado: state,
        progreso: progress,
        intentos: job.attemptsMade,
        fechaCreacion: new Date(job.timestamp).toISOString(),
        error: job.failedReason ?? null,
      })
    },
  )
}
