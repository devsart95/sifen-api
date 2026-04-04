import type { Job } from 'bullmq'
import type { PrismaClient } from '@prisma/client'
import type { KudePdfJobData } from '../bull.js'
import { generarKudePdf } from '../../kude/generator.js'
import * as path from 'node:path'
import * as fs from 'node:fs/promises'

const KUDE_DIR = process.env['KUDE_OUTPUT_DIR'] ?? '/tmp/kude'

/**
 * Procesador del worker de KuDE.
 * Genera el PDF a partir del XML aprobado y lo persiste en disco.
 *
 * En producción, el path de salida debería ser un volumen montado o S3.
 * Ctx: puppeteer es pesado — concurrency = 2 en el worker es suficiente.
 */
export function crearProcesadorKude(prisma: PrismaClient) {
  return async function procesarKude(job: Job<KudePdfJobData>): Promise<void> {
    const { documentoId, cdc, xmlFirmado, tenantId } = job.data

    job.log(`Generando KuDE para CDC: ${cdc}`)

    const { pdf } = await generarKudePdf(xmlFirmado)

    // Persistir PDF en disco (organizado por tenant)
    const tenantDir = path.join(KUDE_DIR, tenantId)
    await fs.mkdir(tenantDir, { recursive: true })

    const outputPath = path.join(tenantDir, `${cdc}.pdf`)
    await fs.writeFile(outputPath, pdf)

    job.log(`KuDE generado: ${outputPath} (${pdf.length} bytes)`)

    await prisma.auditLog.create({
      data: {
        tenantId,
        accion: 'EMISION_DE',
        documentoId,
        exitoso: true,
        mensaje: `KuDE generado: ${outputPath}`,
        detalles: { outputPath, bytes: pdf.length },
      },
    })
  }
}
