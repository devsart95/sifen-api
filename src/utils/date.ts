/**
 * Utilidades de formateo de fechas para los distintos contextos del XML SIFEN.
 * SIFEN usa formatos distintos según el campo: ISO 8601, YYYYMMDD y "YYYY-MM-DD HH:mm:ss".
 */

/**
 * Formatea fecha como "YYYYMMDD" — usada en el CDC (posiciones 26-33).
 * Ejemplo: 2024-11-29 → "20241129"
 */
export function formatearFechaCdc(fecha: Date): string {
  const y = fecha.getFullYear()
  const m = String(fecha.getMonth() + 1).padStart(2, '0')
  const d = String(fecha.getDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

/**
 * Formatea fecha como "YYYY-MM-DD HH:mm:ss" — usada en la URL del QR (dFeEmiDE).
 * Ejemplo: 2024-11-29T17:59:57.000Z → "2024-11-29 17:59:57"
 */
export function formatearFechaQr(fecha: Date): string {
  return fecha.toISOString().replace('T', ' ').slice(0, 19)
}

/**
 * Formatea fecha como ISO 8601 con precisión de segundos — usada en los campos
 * de fecha/hora del XML del DE (dFecFirma, dFeEmiDE).
 * Ejemplo: 2024-11-29T17:59:57.000Z → "2024-11-29T17:59:57"
 */
export function formatearFechaXml(fecha: Date): string {
  return fecha.toISOString().slice(0, 19)
}

/**
 * Formatea solo la parte de fecha como "YYYY-MM-DD" — usada en gTimb.dFeIniT.
 */
export function formatearFechaCorta(fecha: Date): string {
  return fecha.toISOString().slice(0, 10)
}
