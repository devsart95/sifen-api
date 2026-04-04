/**
 * Parser de respuestas XML de SIFEN.
 * SIFEN devuelve XML con campos específicos según el Manual Técnico v150.
 * Este módulo extrae los campos relevantes sin depender de librerías pesadas.
 */

export interface RespuestaSifen {
  codigo: string        // dCodRes: código de respuesta (ej: "0260" = aprobado)
  mensaje: string       // dMsgRes: mensaje descriptivo de SIFEN
  situacion?: number   // iSitDE: 1=aprobado, 2=aprobado con obs, 3=rechazado
  tieneObservaciones: boolean
  protocolo?: string   // dProtCons: número de protocolo (si existe)
}

/**
 * Extrae los campos de respuesta del XML que retorna SIFEN tras procesar un DE.
 * Compatible con los formatos de respuesta de recepción síncrona y de lotes.
 */
export function parsearRespuestaSifen(xml: string): RespuestaSifen | null {
  if (!xml || xml.trim().length === 0) return null

  const codigo = extraerTag(xml, 'dCodRes') ?? extraerTag(xml, 'dCodResEnviDe') ?? ''
  const mensaje = extraerTag(xml, 'dMsgRes') ?? extraerTag(xml, 'dMsgResEnviDe') ?? ''
  const situacionStr = extraerTag(xml, 'iSitDE') ?? extraerTag(xml, 'dSitDe')
  const protocolo = extraerTag(xml, 'dProtCons') ?? extraerTag(xml, 'dProtConsLote')

  const situacion = situacionStr ? parseInt(situacionStr, 10) : undefined

  return {
    codigo,
    mensaje,
    situacion,
    // iSitDE=2 significa "aprobado con observaciones" según MT SIFEN v150
    tieneObservaciones: situacion === 2,
    protocolo,
  }
}

/** Extrae el contenido de un tag XML simple (no anidado). Retorna null si no existe. */
function extraerTag(xml: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*>([^<]*)<\/${tag}>`)
  const match = xml.match(regex)
  return match?.[1]?.trim() ?? null
}
