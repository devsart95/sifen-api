import { createHash } from 'node:crypto'
import { QR_BASE_URL, VERSION_FORMATO } from '../../config/constants.js'
import { formatearFechaQr as _formatearFechaQr } from '../../utils/date.js'

export interface DatosQr {
  cdc: string
  rucEmisor: string
  dvEmisor: string
  totalBruto: number
  totalIva: number
  fechaEmision: Date
  cantidadItems: number    // número real de ítems del DE
  digestValue?: string     // hash SHA256 del XML firmado (disponible post-firma)
  idCsc?: string           // ID del código de seguridad del contribuyente (default '0001')
  valorCsc?: string        // Valor del CSC — si se pasa, se agrega dHashQR al URL (MT v150 §7.4)
}

/**
 * Construye la URL del QR que va embebida en el XML del DE (gCamFuFD.dCarQR).
 * Formato oficial según Manual Técnico SIFEN v150.
 *
 * dHashQR = SHA256(urlSinHash + valorCsc).toUpperCase()
 * Se agrega al final del URL para que DNIT pueda verificar la autenticidad.
 *
 * Nota de flujo: si `digestValue` no está disponible aún (pre-firma),
 * pasar la URL sin DigestValue y completarla después de firmar el XML.
 */
export function construirUrlQr(datos: DatosQr): string {
  const params = new URLSearchParams({
    nVersion: VERSION_FORMATO,
    Id: datos.cdc,
    dFeEmiDE: _formatearFechaQr(datos.fechaEmision),
    dRucRec: `${datos.rucEmisor}-${datos.dvEmisor}`,
    dTotGralOpe: String(datos.totalBruto),
    dTotIVA: String(datos.totalIva),
    cItems: String(datos.cantidadItems),
    IdCSC: datos.idCsc ?? '0001',
  })

  if (datos.digestValue) {
    params.set('DigestValue', datos.digestValue)
  }

  const urlSinHash = `${QR_BASE_URL}?${params.toString()}`

  if (datos.valorCsc) {
    const dHashQR = createHash('sha256')
      .update(urlSinHash + datos.valorCsc)
      .digest('hex')
      .toUpperCase()
    return `${urlSinHash}&dHashQR=${dHashQR}`
  }

  return urlSinHash
}

/** Re-export para compatibilidad con tests directos sobre este módulo */
export { formatearFechaQr } from '../../utils/date.js'
