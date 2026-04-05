import type { FastifyReply, FastifyRequest } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { hashApiKey } from './auth.js'

declare module 'fastify' {
  interface FastifyRequest {
    adminTenantId?: string
  }
}

/**
 * Hook de autenticación para rutas de administración.
 * Requiere una API key con `isAdmin = true`.
 * Se adjunta `request.adminTenantId` para operaciones del propio tenant admin.
 */
export function crearAdminHook(prisma: PrismaClient) {
  return async function adminHook(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const header = request.headers['x-api-key']
    const rawKey = Array.isArray(header) ? header[0] : header

    if (!rawKey) {
      await reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Se requiere el header X-API-Key',
      })
      return
    }

    const keyHash = hashApiKey(rawKey)

    const apiKey = await prisma.apiKey.findUnique({
      where: { hash: keyHash },
      include: { tenant: { select: { id: true, activo: true } } },
    })

    if (!apiKey || !apiKey.activa || !apiKey.tenant.activo || !apiKey.isAdmin) {
      await reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Se requiere una API key de administrador',
      })
      return
    }

    request.tenantId = apiKey.tenant.id
    request.adminTenantId = apiKey.tenant.id
  }
}
