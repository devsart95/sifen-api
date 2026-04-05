import type { Job } from 'bullmq'
import type { PrismaClient } from '@prisma/client'
import type { KudePdfJobData } from '../bull.js'
import { generarKudePdf } from '../../kude/generator.js'
import { getStorageProvider } from '../../storage/factory.js'

/**
 * Procesador del worker de KuDE.
 * Genera el PDF a partir del XML aprobado y lo persiste via StorageProvider.
 *
 * El provider se configura con STORAGE_PROVIDER env var:
 *  - 'local' (default): disco local en STORAGE_LOCAL_DIR
 *  - 's3': bucket S3/MinIO/R2
 *
 * Ctx: puppeteer es pesado — concurrency = 2 en el worker es suficiente.
 */
export function crearProcesadorKude(prisma: PrismaClient) {
  return async function procesarKude(job: Job<KudePdfJobData>): Promise<void> {
    const { documentoId, cdc, xmlFirmado, tenantId } = job.data

    job.log(`Generando KuDE para CDC: ${cdc}`)

    const { pdf } = await generarKudePdf(xmlFirmado)

    // Clave de almacenamiento organizada por tenant — compatible con S3 y local
    const key = `${tenantId}/${cdc}.pdf`
    const storage = getStorageProvider()
    await storage.upload(key, pdf, 'application/pdf')

    job.log(`KuDE guardado: ${key} (${pdf.length} bytes)`)

    await prisma.auditLog.create({
      data: {
        tenantId,
        accion: 'EMISION_DE',
        documentoId,
        exitoso: true,
        mensaje: `KuDE generado y guardado: ${key}`,
        detalles: { key, bytes: pdf.length },
      },
    })
  }
}
