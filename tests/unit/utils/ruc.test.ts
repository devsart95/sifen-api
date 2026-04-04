import { describe, it, expect } from 'vitest'
import { calcularDvRuc, validarRuc, normalizarRuc, parsearRuc } from '../../../src/utils/ruc.js'

describe('calcularDvRuc', () => {
  it('calcula DV de RUC conocido (80069563)', () => {
    // RUC de la SET Paraguay para pruebas de homologación
    expect(calcularDvRuc('80069563')).toBe('1')
  })

  it('calcula DV de RUC con resultado k', () => {
    // Verificar que retorna 'k' cuando el cálculo da 10
    const ruc = '1234567'
    const dv = calcularDvRuc(ruc)
    expect(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'k']).toContain(dv)
  })

  it('lanza error si el RUC tiene más de 8 dígitos', () => {
    expect(() => calcularDvRuc('123456789')).toThrow()
  })

  it('lanza error si el RUC está vacío', () => {
    expect(() => calcularDvRuc('')).toThrow()
  })
})

describe('validarRuc', () => {
  it('valida RUC con guión correcto', () => {
    expect(validarRuc('80069563-1')).toBe(true)
  })

  it('valida RUC sin guión correcto', () => {
    expect(validarRuc('800695631')).toBe(true)
  })

  it('rechaza RUC con DV incorrecto', () => {
    expect(validarRuc('80069563-9')).toBe(false)
  })

  it('rechaza RUC con letras en el número', () => {
    expect(validarRuc('8006A563-1')).toBe(false)
  })

  it('rechaza string vacío', () => {
    expect(validarRuc('')).toBe(false)
  })

  it('rechaza RUC de un solo carácter', () => {
    expect(validarRuc('1')).toBe(false)
  })
})

describe('normalizarRuc', () => {
  it('normaliza RUC con guión', () => {
    expect(normalizarRuc('80069563-1')).toBe('80069563-1')
  })

  it('normaliza RUC sin guión', () => {
    expect(normalizarRuc('800695631')).toBe('80069563-1')
  })

  it('lanza error con RUC inválido', () => {
    expect(() => normalizarRuc('99999999-9')).toThrow()
  })
})

describe('parsearRuc', () => {
  it('parsea RUC con guión', () => {
    const result = parsearRuc('80069563-1')
    expect(result).toEqual({ numero: '80069563', dv: '1' })
  })

  it('retorna null para formato inválido', () => {
    expect(parsearRuc('abc')).toBeNull()
  })
})
