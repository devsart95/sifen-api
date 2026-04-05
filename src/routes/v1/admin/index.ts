import { randomBytes } from 'node:crypto'
import type { FastifyPluginAsync } from 'fastify'
import { Prisma, type PrismaClient } from '@prisma/client'
import type { CertificateManager } from '../../../services/certificate/types.js'
import { crearAdminHook } from '../../../middleware/admin.js'
import { hashApiKey } from '../../../middleware/auth.js'
import {
  CrearTenantSchema,
  ActualizarTenantSchema,
  CrearApiKeySchema,
  CrearTimbradoSchema,
  ActualizarTimbradoSchema,
  SubirCertSchema,
} from '../../../schemas/admin.schema.js'

interface AdminRouteOptions {
  prisma: PrismaClient
  certManager: CertificateManager
  onCertActualizado?: (tenantId: string) => void
}

/** Distingue un error "registro no encontrado" de otros errores de Prisma/DB */
function esNotFound(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025'
}

export const adminRoutes: FastifyPluginAsync<AdminRouteOptions> = async (fastify, opts) => {
  const { prisma, certManager, onCertActualizado } = opts
  const adminHook = crearAdminHook(prisma)

  // Todas las rutas admin requieren API key con isAdmin=true
  fastify.addHook('preHandler', adminHook)

  // ─── Tenants ─────────────────────────────────────────────────────────────────

  fastify.get(
    '/tenants',
    { schema: { tags: ['Admin'], summary: 'Listar todos los tenants' } },
    async () => {
      return prisma.tenant.findMany({
        select: {
          id: true, nombre: true, ruc: true, dvRuc: true, activo: true,
          rateLimitMax: true, webhookActivo: true, certSubidoEn: true,
          certExpiraEn: true, creadoEn: true,
        },
        orderBy: { creadoEn: 'desc' },
      })
    },
  )

  fastify.post(
    '/tenants',
    { schema: { tags: ['Admin'], summary: 'Crear tenant', body: CrearTenantSchema } },
    async (request, reply) => {
      const input = CrearTenantSchema.parse(request.body)
      const tenant = await prisma.tenant.create({
        data: {
          nombre: input.nombre,
          ruc: input.ruc,
          dvRuc: input.dvRuc,
          rateLimitMax: input.rateLimitMax,
          idCsc: input.idCsc,
          csc: input.csc,
        },
        select: { id: true, nombre: true, ruc: true, dvRuc: true, creadoEn: true },
      })
      return reply.status(201).send(tenant)
    },
  )

  fastify.get(
    '/tenants/:tenantId',
    { schema: { tags: ['Admin'], summary: 'Obtener tenant por ID' } },
    async (request, reply) => {
      const { tenantId } = request.params as { tenantId: string }
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          id: true, nombre: true, ruc: true, dvRuc: true, activo: true,
          rateLimitMax: true, webhookUrl: true, webhookActivo: true,
          certSubidoEn: true, certExpiraEn: true, creadoEn: true, actualizadoEn: true,
        },
      })
      if (!tenant) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: `Tenant ${tenantId} no encontrado` })
      }
      return tenant
    },
  )

  fastify.put(
    '/tenants/:tenantId',
    { schema: { tags: ['Admin'], summary: 'Actualizar tenant' } },
    async (request, reply) => {
      const { tenantId } = request.params as { tenantId: string }
      const input = ActualizarTenantSchema.parse(request.body)
      try {
        const updated = await prisma.tenant.update({
          where: { id: tenantId },
          data: input,
          select: { id: true, nombre: true, activo: true, actualizadoEn: true },
        })
        return updated
      } catch (err) {
        if (esNotFound(err)) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: `Tenant ${tenantId} no encontrado` })
        throw err
      }
    },
  )

  // ─── Certificados ─────────────────────────────────────────────────────────────

  fastify.post(
    '/tenants/:tenantId/cert',
    { schema: { tags: ['Admin'], summary: 'Subir/actualizar certificado P12 del tenant' } },
    async (request, reply) => {
      const { tenantId } = request.params as { tenantId: string }
      const input = SubirCertSchema.parse(request.body)

      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } })
      if (!tenant) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: `Tenant ${tenantId} no encontrado` })
      }

      const p12Buffer = Buffer.from(input.p12Base64, 'base64')

      // Extraer fecha de expiración del certificado X509 embebido en el P12
      let expiraEn: Date | undefined
      try {
        const forge = await import('node-forge')
        const p12Asn1 = forge.default.asn1.fromDer(forge.default.util.createBuffer(p12Buffer.toString('binary')))
        const p12 = forge.default.pkcs12.pkcs12FromAsn1(p12Asn1, input.passphrase)
        const certBags = p12.getBags({ bagType: forge.default.pki.oids.certBag })
        const certBag = certBags[forge.default.pki.oids.certBag]?.[0]
        if (certBag?.cert) {
          expiraEn = certBag.cert.validity.notAfter
        }
      } catch {
        // No crítico si no se puede extraer la fecha
      }

      await certManager.guardarCert(tenantId, p12Buffer, input.passphrase, expiraEn)
      // Invalidar también el pool de SoapClients para que el próximo request use el nuevo cert
      onCertActualizado?.(tenantId)

      return reply.status(200).send({
        mensaje: 'Certificado guardado exitosamente',
        expiraEn: expiraEn?.toISOString(),
      })
    },
  )

  // ─── API Keys ─────────────────────────────────────────────────────────────────

  fastify.get(
    '/tenants/:tenantId/api-keys',
    { schema: { tags: ['Admin'], summary: 'Listar API keys del tenant' } },
    async (request, reply) => {
      const { tenantId } = request.params as { tenantId: string }
      const keys = await prisma.apiKey.findMany({
        where: { tenantId },
        select: { id: true, nombre: true, activa: true, isAdmin: true, ultimoUso: true, creadaEn: true },
        orderBy: { creadaEn: 'desc' },
      })
      return keys
    },
  )

  fastify.post(
    '/tenants/:tenantId/api-keys',
    { schema: { tags: ['Admin'], summary: 'Crear API key para el tenant' } },
    async (request, reply) => {
      const { tenantId } = request.params as { tenantId: string }
      const input = CrearApiKeySchema.parse(request.body)

      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } })
      if (!tenant) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: `Tenant ${tenantId} no encontrado` })
      }

      // Generar key aleatoria y hashearla para almacenamiento seguro
      const rawKey = randomBytes(32).toString('hex')
      const hash = hashApiKey(rawKey)

      const apiKey = await prisma.apiKey.create({
        data: { tenantId, hash, nombre: input.nombre, isAdmin: input.isAdmin },
        select: { id: true, nombre: true, isAdmin: true, creadaEn: true },
      })

      return reply.status(201).send({
        ...apiKey,
        // Se retorna solo una vez — no se puede recuperar después
        apiKey: rawKey,
        advertencia: 'Guarda este valor. No será mostrado nuevamente.',
      })
    },
  )

  fastify.delete(
    '/tenants/:tenantId/api-keys/:keyId',
    { schema: { tags: ['Admin'], summary: 'Revocar API key' } },
    async (request, reply) => {
      const { tenantId, keyId } = request.params as { tenantId: string; keyId: string }
      try {
        await prisma.apiKey.update({
          where: { id: keyId, tenantId },
          data: { activa: false },
        })
        return reply.status(204).send()
      } catch (err) {
        if (esNotFound(err)) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: `API key ${keyId} no encontrada` })
        throw err
      }
    },
  )

  // ─── Timbrados ────────────────────────────────────────────────────────────────

  fastify.get(
    '/tenants/:tenantId/timbrados',
    { schema: { tags: ['Admin'], summary: 'Listar timbrados del tenant' } },
    async (request) => {
      const { tenantId } = request.params as { tenantId: string }
      return prisma.timbrado.findMany({
        where: { tenantId },
        orderBy: { creadoEn: 'desc' },
      })
    },
  )

  fastify.post(
    '/tenants/:tenantId/timbrados',
    { schema: { tags: ['Admin'], summary: 'Crear timbrado para el tenant' } },
    async (request, reply) => {
      const { tenantId } = request.params as { tenantId: string }
      const input = CrearTimbradoSchema.parse(request.body)

      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } })
      if (!tenant) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: `Tenant ${tenantId} no encontrado` })
      }

      try {
        const timbrado = await prisma.timbrado.create({
          data: { tenantId, ...input },
        })
        return reply.status(201).send(timbrado)
      } catch (err) {
        // P2002 = unique constraint violation
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          return reply.status(409).send({
            statusCode: 409,
            error: 'Conflict',
            message: 'Ya existe un timbrado con esa combinación de número/establecimiento/punto/tipo',
          })
        }
        throw err
      }
    },
  )

  fastify.put(
    '/tenants/:tenantId/timbrados/:timbradoId',
    { schema: { tags: ['Admin'], summary: 'Actualizar timbrado' } },
    async (request, reply) => {
      const { tenantId, timbradoId } = request.params as { tenantId: string; timbradoId: string }
      const input = ActualizarTimbradoSchema.parse(request.body)
      try {
        const updated = await prisma.timbrado.update({
          where: { id: timbradoId, tenantId },
          data: input,
        })
        return updated
      } catch (err) {
        if (esNotFound(err)) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: `Timbrado ${timbradoId} no encontrado` })
        throw err
      }
    },
  )
}
