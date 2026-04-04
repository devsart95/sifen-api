/**
 * Utilidades para validación y formateo de RUC paraguayo.
 * Algoritmo módulo 11 según especificación SET.
 */

const MULTIPLICADORES = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5, 6, 7, 8]

/**
 * Calcula el dígito verificador de un RUC.
 * @param rucSinDv - RUC sin el dígito verificador (solo números)
 * @returns dígito verificador (0-9 o 'k' para el caso especial)
 */
export function calcularDvRuc(rucSinDv: string): string {
  const digitos = rucSinDv.replace(/\D/g, '')

  if (digitos.length < 1 || digitos.length > 8) {
    throw new Error(`RUC inválido: longitud ${digitos.length}, se esperaba 1-8 dígitos`)
  }

  const digitosArray = digitos.split('').reverse()
  let suma = 0

  for (let i = 0; i < digitosArray.length; i++) {
    const multiplicador = MULTIPLICADORES[i]
    if (multiplicador === undefined) break
    suma += parseInt(digitosArray[i] ?? '0', 10) * multiplicador
  }

  const resto = suma % 11
  const dv = 11 - resto

  if (dv === 11) return '0'
  if (dv === 10) return 'k'
  return String(dv)
}

/**
 * Valida un RUC completo con dígito verificador.
 * Acepta formatos: "12345678-9", "123456789", "12345678k"
 */
export function validarRuc(ruc: string): boolean {
  const normalizado = ruc.trim().toLowerCase().replace('-', '')

  if (normalizado.length < 2) return false

  const dv = normalizado.slice(-1)
  const numero = normalizado.slice(0, -1)

  if (!/^\d+$/.test(numero)) return false
  if (!/^[\dk]$/.test(dv)) return false

  try {
    return calcularDvRuc(numero) === dv
  } catch {
    return false
  }
}

/**
 * Normaliza un RUC al formato "XXXXXXXX-D" sin ceros a la izquierda.
 * Lanza si el RUC es inválido.
 */
export function normalizarRuc(ruc: string): string {
  const normalizado = ruc.trim().toLowerCase().replace('-', '')
  const dv = normalizado.slice(-1)
  const numero = normalizado.slice(0, -1)

  if (!validarRuc(ruc)) {
    throw new Error(`RUC inválido: ${ruc}`)
  }

  return `${parseInt(numero, 10)}-${dv.toUpperCase()}`
}

/**
 * Extrae número y DV de un RUC.
 * Retorna null si el formato es inválido.
 */
export function parsearRuc(ruc: string): { numero: string; dv: string } | null {
  const normalizado = ruc.trim().toLowerCase().replace('-', '')
  if (normalizado.length < 2) return null

  const dv = normalizado.slice(-1)
  const numero = normalizado.slice(0, -1)

  if (!/^\d+$/.test(numero)) return null
  if (!/^[\dk]$/.test(dv)) return null

  return { numero: parseInt(numero, 10).toString(), dv: dv.toUpperCase() }
}
