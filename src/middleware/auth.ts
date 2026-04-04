import type { FastifyReply, FastifyRequest } from 'fastify'
import { createHash, timingSafeEqual } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'

declare module 'fastify' {
  interface FastifyRequest {
    tenantId: string
  }
}

/**
 * Hook de autenticación por API key.
 *
 * El cliente debe enviar el header:
 *   X-API-Key: <api-key-generada-al-crear-tenant>
 *
 * El key se hashea con SHA-256 antes de comparar contra la DB
 * (bcrypt sería más seguro pero agrega latencia; SHA-256 es aceptable
 * porque los keys son aleatorios de 32+ bytes y no son passwords).
 *
 * Se adjunta `request.tenantId` para uso en los handlers.
 */
export function crearAuthHook(prisma: PrismaClient) {
  return async function authHook(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const rawKey = extractApiKey(request)

    if (!rawKey) {
      await reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Se requiere el header X-API-Key',
      })
      return
    }

    // Hash SHA-256 del key recibido para comparar contra DB
    const keyHash = hashApiKey(rawKey)

    const apiKey = await prisma.apiKey.findUnique({
      where: { hash: keyHash },
      include: { tenant: { select: { id: true, activo: true } } },
    })

    if (!apiKey || !apiKey.activa || !apiKey.tenant.activo) {
      await reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'API key inválida o inactiva',
      })
      return
    }

    // Adjuntar tenantId para los handlers
    request.tenantId = apiKey.tenant.id

    // Actualizar último uso en background (no bloquear el request)
    void prisma.apiKey
      .update({
        where: { id: apiKey.id },
        data: { ultimoUso: new Date() },
      })
      .catch(() => {
        // No crítico si falla
      })
  }
}

/**
 * Hashea una API key con SHA-256.
 * Se usa SHA-256 porque las keys son aleatorias (entropía suficiente),
 * no passwords eligidas por humanos.
 */
export function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex')
}

/**
 * Compara dos hashes de forma segura contra timing attacks.
 */
export function apiKeyHashesIguales(hash1: string, hash2: string): boolean {
  if (hash1.length !== hash2.length) return false
  return timingSafeEqual(Buffer.from(hash1), Buffer.from(hash2))
}

function extractApiKey(request: FastifyRequest): string | null {
  const header = request.headers['x-api-key']
  if (!header) return null
  if (Array.isArray(header)) return header[0] ?? null
  return header
}
