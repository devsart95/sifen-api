import type { FastifyPluginAsync } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import type { SifenSoapClient } from '../../../services/sifen/soap.client.js'
import { crearAuthHook } from '../../../middleware/auth.js'
import { validarRuc } from '../../../utils/ruc.js'

interface ConsultasRouteOptions {
  prisma: PrismaClient
  getSoapClient: (tenantId: string) => Promise<SifenSoapClient>
}

export const consultasRoutes: FastifyPluginAsync<ConsultasRouteOptions> = async (
  fastify,
  opts,
) => {
  const { prisma, getSoapClient } = opts
  const authHook = crearAuthHook(prisma)

  // ─── GET /v1/consultas/ruc/:ruc ───────────────────────────────────────────

  fastify.get(
    '/ruc/:ruc',
    {
      preHandler: authHook,
      schema: {
        tags: ['Consultas'],
        summary: 'Consultar datos de un contribuyente por RUC',
        description:
          'Consulta la base de datos de la SET y retorna razón social, ' +
          'tipo de contribuyente y estado.',
        params: {
          type: 'object',
          properties: { ruc: { type: 'string', description: 'RUC con o sin DV (ej: 80069563-1)' } },
          required: ['ruc'],
        },
      },
    },
    async (request, reply) => {
      const { ruc } = request.params as { ruc: string }
      const tenantId = request.tenantId

      if (!validarRuc(ruc)) {
        return reply.status(422).send({
          statusCode: 422,
          error: 'RUC inválido',
          message: `El RUC "${ruc}" no tiene un dígito verificador correcto`,
        })
      }

      const rucSinDv = ruc.replace('-', '').slice(0, -1)
      const soapClient = await getSoapClient(tenantId)
      const respuesta = await soapClient.consultarRuc(rucSinDv)

      await prisma.auditLog.create({
        data: {
          tenantId,
          accion: 'CONSULTA_RUC',
          exitoso: respuesta.ok,
          ip: request.ip,
        },
      })

      if (!respuesta.ok) {
        return reply.status(502).send({
          statusCode: 502,
          error: 'Error al consultar RUC en SIFEN',
          message: respuesta.error ?? 'Sin respuesta de SIFEN',
        })
      }

      return reply.send({
        ruc,
        respuestaXml: respuesta.data,
      })
    },
  )

  // ─── GET /v1/consultas/lote/:protocolo ───────────────────────────────────

  fastify.get(
    '/lote/:protocolo',
    {
      preHandler: authHook,
      schema: {
        tags: ['Consultas'],
        summary: 'Consultar estado de un lote por número de protocolo',
        description:
          'Retorna el estado del procesamiento asíncrono de un lote de DEs.',
        params: {
          type: 'object',
          properties: {
            protocolo: { type: 'string', description: 'Número de protocolo devuelto al enviar el lote' },
          },
          required: ['protocolo'],
        },
      },
    },
    async (request, reply) => {
      const { protocolo } = request.params as { protocolo: string }
      const tenantId = request.tenantId

      const soapClient = await getSoapClient(tenantId)
      const respuesta = await soapClient.consultarLote(protocolo)

      await prisma.auditLog.create({
        data: {
          tenantId,
          accion: 'CONSULTA_LOTE',
          exitoso: respuesta.ok,
          ip: request.ip,
        },
      })

      if (!respuesta.ok) {
        return reply.status(502).send({
          statusCode: 502,
          error: 'Error al consultar lote en SIFEN',
          message: respuesta.error ?? 'Sin respuesta de SIFEN',
        })
      }

      return reply.send({ protocolo, respuestaXml: respuesta.data })
    },
  )
}
