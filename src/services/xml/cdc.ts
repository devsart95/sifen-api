import { TIPO_EMISION } from '../../config/constants.js'

export interface DatosCdc {
  tipoDocumento: number          // iTiDE 1-9
  rucEmisor: string              // sin DV, sin guión, 8 chars con padding
  establecimiento: string        // 3 dígitos
  puntoExpedicion: string        // 3 dígitos
  numero: number                 // número correlativo del DE
  fecha: Date                    // fecha de emisión
  tipoEmision?: 1 | 2            // 1=Normal, 2=Contingencia
  codigoSeguridad?: string       // 9 dígitos aleatorios (se genera si no se provee)
}

/**
 * Genera el CDC (Código de Control) de 44 caracteres.
 * Estructura: 01 + RUC(8) + EST(3) + PUN(3) + TIPO(2) + NUM(7) + FECHA(8) + TIPOEMI(2) + SEG(9) + DV(1)
 */
export function generarCdc(datos: DatosCdc): string {
  const ruc = datos.rucEmisor.replace(/\D/g, '').padStart(8, '0')
  const est = datos.establecimiento.padStart(3, '0')
  const pun = datos.puntoExpedicion.padStart(3, '0')
  const tipo = String(datos.tipoDocumento).padStart(2, '0')
  const num = String(datos.numero).padStart(7, '0')
  const fecha = formatearFechaCdc(datos.fecha)
  const tipoEmi = String(datos.tipoEmision ?? TIPO_EMISION.NORMAL).padStart(2, '0')
  const seg = datos.codigoSeguridad ?? generarCodigoSeguridad()

  const cdcSinDv = `01${ruc}${est}${pun}${tipo}${num}${fecha}${tipoEmi}${seg}`

  if (cdcSinDv.length !== 43) {
    throw new Error(`CDC inválido: longitud ${cdcSinDv.length}, se esperaban 43 chars (sin DV)`)
  }

  const dv = calcularDvCdc(cdcSinDv)
  return `${cdcSinDv}${dv}`
}

/**
 * Calcula el dígito verificador del CDC (módulo 11).
 */
export function calcularDvCdc(cdcSinDv: string): number {
  const MULTIPLICADORES = [2, 3, 4, 5, 6, 7, 8, 9]
  const digitos = cdcSinDv.split('').reverse()

  let suma = 0
  for (let i = 0; i < digitos.length; i++) {
    const mult = MULTIPLICADORES[i % MULTIPLICADORES.length] ?? 2
    suma += parseInt(digitos[i] ?? '0', 10) * mult
  }

  const resto = suma % 11
  const dv = 11 - resto

  if (dv >= 10) return 0
  return dv
}

/**
 * Valida que un CDC tenga estructura y DV correctos.
 */
export function validarCdc(cdc: string): boolean {
  if (cdc.length !== 44) return false
  if (!/^\d+$/.test(cdc)) return false
  if (!cdc.startsWith('01')) return false

  const cdcSinDv = cdc.slice(0, 43)
  const dvEsperado = calcularDvCdc(cdcSinDv)
  const dvActual = parseInt(cdc[43] ?? '-1', 10)

  return dvEsperado === dvActual
}

/** Genera 9 dígitos aleatorios para el código de seguridad */
function generarCodigoSeguridad(): string {
  const seg = Math.floor(Math.random() * 1_000_000_000)
  return String(seg).padStart(9, '0')
}

/** Formatea fecha como YYYYMMDD para el CDC */
function formatearFechaCdc(fecha: Date): string {
  const y = fecha.getFullYear()
  const m = String(fecha.getMonth() + 1).padStart(2, '0')
  const d = String(fecha.getDate()).padStart(2, '0')
  return `${y}${m}${d}`
}
