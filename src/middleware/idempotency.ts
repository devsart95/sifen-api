import type { FastifyReply, FastifyRequest, FastifyPluginAsync } from 'fastify'
import type { PrismaClient } from '@prisma/client'

const TTL_MS = 24 * 60 * 60 * 1000 // 24 horas

/**
 * Plugin de idempotencia para Fastify.
 * Si el request incluye el header `X-Idempotency-Key`, busca si ya se procesó.
 * En caso afirmativo, retorna la respuesta original sin re-procesar.
 *
 * Uso: registrar solo en rutas de mutación (POST /documentos, POST /eventos).
 *
 * El cliente es responsable de generar keys únicas (UUID v4 recomendado).
 * Las keys expiran a las 24 horas.
 */
export function crearIdempotencyPlugin(prisma: PrismaClient): FastifyPluginAsync {
  return async function idempotencyPlugin(fastify) {
    fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
      const rawKey = request.headers['x-idempotency-key']
      if (!rawKey || Array.isArray(rawKey)) return

      const tenantId = request.tenantId
      if (!tenantId) return // no autenticado — el auth hook lo rechazará

      // Namespace la key por tenant para evitar colisiones entre tenants
      const key = `${tenantId}:${rawKey}`

      const registro = await prisma.idempotencyRecord.findUnique({
        where: { key },
      })

      if (registro) {
        if (registro.expiresAt > new Date()) {
          // Hit: retornar respuesta original
          reply.status(registro.statusCode)
          reply.header('X-Idempotency-Replayed', 'true')
          return reply.send(registro.responseBody)
        }
        // Expirado: eliminar y procesar de nuevo
        await prisma.idempotencyRecord.delete({ where: { key } }).catch(() => null)
      }

      // No existe: guardar la key pendiente y continuar
      // La respuesta se guarda en onSend hook
      request.idempotencyKey = key
    })

    fastify.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply, payload) => {
      if (!request.idempotencyKey) return payload
      if (reply.statusCode >= 500) return payload // no cachear errores del server

      try {
        const responseBody = typeof payload === 'string'
          ? (JSON.parse(payload) as unknown)
          : payload

        await prisma.idempotencyRecord.create({
          data: {
            key: request.idempotencyKey,
            tenantId: request.tenantId,
            responseBody: responseBody as object,
            statusCode: reply.statusCode,
            expiresAt: new Date(Date.now() + TTL_MS),
          },
        })
      } catch {
        // Si falla el guardado de idempotencia, no interrumpir la respuesta al cliente
      }

      return payload
    })
  }
}

// Declaración de tipos para Fastify
declare module 'fastify' {
  interface FastifyRequest {
    idempotencyKey?: string
  }
}
