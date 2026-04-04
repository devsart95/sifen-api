import type { FastifyPluginAsync } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import type { SifenSoapClient } from '../../../services/sifen/soap.client.js'
import { EmitirDeSchema } from '../../../schemas/de.schema.js'
import { generarXmlDe } from '../../../services/xml/generator.js'
import { firmarXmlDe } from '../../../services/xml/signer.js'
import { validarEstructuraXml } from '../../../services/xml/validator.js'
import { crearAuthHook } from '../../../middleware/auth.js'
import { calcularTotalesIva, type ItemIva } from '../../../utils/iva.js'
import { generarKudePdf } from '../../../services/kude/generator.js'
import * as fs from 'node:fs'
import { env } from '../../../config/env.js'

interface DocumentosRouteOptions {
  prisma: PrismaClient
  soapClient: SifenSoapClient
}

export const documentosRoutes: FastifyPluginAsync<DocumentosRouteOptions> = async (
  fastify,
  opts,
) => {
  const { prisma, soapClient } = opts
  const authHook = crearAuthHook(prisma)

  // ─── POST /v1/documentos — Emitir DE ──────────────────────────────────────

  fastify.post(
    '/',
    {
      preHandler: authHook,
      schema: {
        tags: ['Documentos'],
        summary: 'Emitir Documento Electrónico',
        description:
          'Genera el XML, lo firma con el certificado del tenant, lo envía a SIFEN ' +
          'y retorna el CDC aprobado. Soporta Facturas (tipo 1), Notas de Crédito (5), ' +
          'Notas de Débito (6) y Notas de Remisión (7).',
        body: EmitirDeSchema,
      },
    },
    async (request, reply) => {
      const input = EmitirDeSchema.parse(request.body)
      const tenantId = request.tenantId

      // 1. Obtener timbrado del tenant
      const timbrado = await prisma.timbrado.findFirst({
        where: {
          tenantId,
          numero: input.timbrado.numero,
          establecimiento: input.timbrado.establecimiento,
          puntoExpedicion: input.timbrado.puntoExpedicion,
          tipoDocumento: input.tipoDocumento,
          activo: true,
        },
      })

      if (!timbrado) {
        return reply.status(422).send({
          statusCode: 422,
          error: 'Timbrado no encontrado',
          message: `No se encontró un timbrado activo para ${input.timbrado.numero} / ${input.timbrado.establecimiento}-${input.timbrado.puntoExpedicion}`,
        })
      }

      // 2. Calcular totales IVA para persistencia en DB
      const itemsIva: ItemIva[] = input.items.map((item) => ({
        precioUnitario: item.precioUnitario,
        cantidad: item.cantidad,
        descuento: item.descuento,
        afecIva: item.afecIva,
        tasaIva: item.tasaIva,
      }))
      const totales = calcularTotalesIva(itemsIva)

      // 3. Generar XML
      const { xml, cdc, urlQr } = generarXmlDe(input)

      // 4. Validar estructura antes de firmar
      const validacion = validarEstructuraXml(xml)
      if (!validacion.valid) {
        return reply.status(422).send({
          statusCode: 422,
          error: 'XML inválido',
          message: 'El documento generado no pasa la validación de estructura',
          details: validacion.errors,
        })
      }

      // 5. Firmar con el certificado del contribuyente
      const p12Buffer = fs.readFileSync(env.SIFEN_CERT_PATH)
      const { xmlFirmado, digestValue } = firmarXmlDe(xml, {
        p12Buffer,
        passphrase: env.SIFEN_CERT_PASS,
      })

      // 6. Actualizar URL QR con el DigestValue real (post-firma)
      const urlQrFinal = urlQr.replace('DigestValue=&', `DigestValue=${encodeURIComponent(digestValue)}&`)

      // 7. Guardar en DB con estado PENDIENTE
      const documento = await prisma.documentoElectronico.create({
        data: {
          tenantId,
          timbradoId: timbrado.id,
          cdc,
          numero: parseInt(cdc.slice(19, 26), 10),
          tipoDocumento: input.tipoDocumento,
          tipoEmision: input.tipoEmision,
          estado: 'PENDIENTE',
          receptorRuc: input.receptor.documento,
          receptorNombre: input.receptor.razonSocial,
          moneda: input.moneda,
          totalBruto: totales.totalBruto,
          totalIva: totales.totalIva,
          xmlFirmado,
          fechaEmision: input.fechaEmision ?? new Date(),
        },
      })

      // 8. Enviar a SIFEN
      const respuestaSifen = await soapClient.recibirDe(xmlFirmado)

      // 9. Actualizar estado según respuesta
      const estadoFinal = respuestaSifen.ok ? 'APROBADO' : 'RECHAZADO'
      await prisma.documentoElectronico.update({
        where: { id: documento.id },
        data: {
          estado: estadoFinal,
          xmlRespuesta: respuestaSifen.data ?? respuestaSifen.error,
          fechaAprobacion: respuestaSifen.ok ? new Date() : undefined,
        },
      })

      // 10. Audit log
      await prisma.auditLog.create({
        data: {
          tenantId,
          accion: 'EMISION_DE',
          documentoId: documento.id,
          exitoso: respuestaSifen.ok,
          mensaje: respuestaSifen.ok ? 'DE aprobado por SIFEN' : respuestaSifen.error,
          ip: request.ip,
        },
      })

      if (!respuestaSifen.ok) {
        return reply.status(422).send({
          statusCode: 422,
          error: 'SIFEN rechazó el documento',
          message: respuestaSifen.error ?? 'Error desconocido al enviar a SIFEN',
          cdc,
        })
      }

      return reply.status(201).send({
        cdc,
        estado: estadoFinal,
        urlQr: urlQrFinal,
        xmlRespuesta: respuestaSifen.data,
      })
    },
  )

  // ─── GET /v1/documentos/:cdc — Consultar DE por CDC ───────────────────────

  fastify.get(
    '/:cdc',
    {
      preHandler: authHook,
      schema: {
        tags: ['Documentos'],
        summary: 'Consultar estado de un DE por CDC',
        description: 'Retorna el estado local y consulta SIFEN en tiempo real.',
        params: {
          type: 'object',
          properties: { cdc: { type: 'string', minLength: 44, maxLength: 44 } },
          required: ['cdc'],
        },
      },
    },
    async (request, reply) => {
      const { cdc } = request.params as { cdc: string }
      const tenantId = request.tenantId

      const documento = await prisma.documentoElectronico.findFirst({
        where: { cdc, tenantId },
        select: {
          id: true, cdc: true, estado: true, tipoDocumento: true,
          receptorNombre: true, totalBruto: true, totalIva: true,
          moneda: true, fechaEmision: true, fechaAprobacion: true,
          nroProtocolo: true,
        },
      })

      if (!documento) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `No se encontró el documento con CDC: ${cdc}`,
        })
      }

      // Consulta en tiempo real a SIFEN
      const consultaSifen = await soapClient.consultarPorCdc(cdc)

      return reply.send({
        ...documento,
        sifen: consultaSifen.ok
          ? { consultado: true, respuesta: consultaSifen.data }
          : { consultado: false, error: consultaSifen.error },
      })
    },
  )

  // ─── GET /v1/documentos/:cdc/kude — Descargar PDF KuDE ───────────────────

  fastify.get(
    '/:cdc/kude',
    {
      preHandler: authHook,
      schema: {
        tags: ['Documentos'],
        summary: 'Descargar PDF KuDE del documento',
        description:
          'Genera y retorna el PDF del Kuatia Digital Electrónico (KuDE) ' +
          'para impresión o envío al receptor.',
        params: {
          type: 'object',
          properties: { cdc: { type: 'string', minLength: 44, maxLength: 44 } },
          required: ['cdc'],
        },
      },
    },
    async (request, reply) => {
      const { cdc } = request.params as { cdc: string }
      const tenantId = request.tenantId

      const documento = await prisma.documentoElectronico.findFirst({
        where: { cdc, tenantId },
        select: { xmlFirmado: true, estado: true },
      })

      if (!documento) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `No se encontró el documento con CDC: ${cdc}`,
        })
      }

      if (!documento.xmlFirmado) {
        return reply.status(422).send({
          statusCode: 422,
          error: 'XML no disponible',
          message: 'El documento no tiene XML firmado almacenado',
        })
      }

      const { pdf } = await generarKudePdf(documento.xmlFirmado)

      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="kude-${cdc}.pdf"`)
        .send(pdf)
    },
  )
}
