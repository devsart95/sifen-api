import { QR_BASE_URL, VERSION_FORMATO } from '../../config/constants.js'
import { calcularDvCdc } from './cdc.js'

export interface DatosQr {
  cdc: string
  rucEmisor: string
  dvEmisor: string
  totalBruto: number
  totalIva: number
  fechaEmision: Date
  tipoContribuyente: 1 | 2  // 1=Física, 2=Jurídica
  esCfe?: boolean            // Comprobante de Facturación Electrónica
}

/**
 * Construye la URL del QR que va embebida en el XML del DE (gCamFuFD.dCarQR).
 * Formato oficial según Manual Técnico SIFEN v150.
 */
export function construirUrlQr(datos: DatosQr): string {
  const params = new URLSearchParams({
    nVersion: VERSION_FORMATO,
    Id: datos.cdc,
    dFeEmiDE: formatearFechaQr(datos.fechaEmision),
    dRucRec: `${datos.rucEmisor}-${datos.dvEmisor}`,
    dTotGralOpe: String(datos.totalBruto),
    dTotIVA: String(datos.totalIva),
    cItems: String(calcularDvCdc(datos.cdc.slice(0, 43))),
    DigestValue: '',  // Se completa después de firmar
    IdCSC: '0001',    // ID del código de seguridad del contribuyente
  })

  return `${QR_BASE_URL}?${params.toString()}`
}

/** Formatea fecha ISO 8601 para el QR */
function formatearFechaQr(fecha: Date): string {
  return fecha.toISOString().replace('T', ' ').slice(0, 19)
}
