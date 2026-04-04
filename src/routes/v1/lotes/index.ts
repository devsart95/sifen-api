import * as fs from 'node:fs'
import type { FastifyPluginAsync } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { EmitirDeSchema } from '../../../schemas/de.schema.js'
import { generarXmlDe } from '../../../services/xml/generator.js'
import { firmarXmlDe } from '../../../services/xml/signer.js'
import { loteDeQueue } from '../../../services/queue/bull.js'
import { crearAuthHook } from '../../../middleware/auth.js'
import { LIMITES } from '../../../config/constants.js'
import { env } from '../../../config/env.js'

// Certificado leído una sola vez al inicio del módulo (C1)
const p12Buffer = fs.readFileSync(env.SIFEN_CERT_PATH)

const LoteSchema = z.object({
  documentos: z
    .array(EmitirDeSchema)
    .min(1, 'El lote debe tener al menos 1 documento')
    .max(LIMITES.MAX_DES_POR_LOTE, `El lote no puede superar ${LIMITES.MAX_DES_POR_LOTE} documentos`),
})

interface LotesRouteOptions {
  prisma: PrismaClient
}

export const lotesRoutes: FastifyPluginAsync<LotesRouteOptions> = async (fastify, opts) => {
  const { prisma } = opts
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

      // Generar y firmar todos los XMLs
      const xmlsFirmados: string[] = []
      const cdcs: string[] = []

      for (const input of documentos) {
        const { xml, cdc } = generarXmlDe(input, cdcs.length + 1)
        const { xmlFirmado } = firmarXmlDe(xml, {
          p12Buffer,
          passphrase: env.SIFEN_CERT_PASS,
        })
        xmlsFirmados.push(xmlFirmado)
        cdcs.push(cdc)
      }

      // Encolar el lote
      const job = await loteDeQueue.add(
        `lote-${tenantId}-${Date.now()}`,
        {
          tenantId,
          loteId: `lote-${Date.now()}`,
          xmlsDe: xmlsFirmados,
          cdcs,
          idLote: Math.floor(Math.random() * 100_000),
        },
        { priority: 1 },
      )

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

      const job = await loteDeQueue.getJob(jobId)
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
