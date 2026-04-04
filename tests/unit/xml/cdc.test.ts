import { describe, it, expect } from 'vitest'
import { generarCdc, calcularDvCdc, validarCdc } from '../../../src/services/xml/cdc.js'

describe('calcularDvCdc', () => {
  it('calcula DV para CDC conocido de SIFEN docs', () => {
    // Ejemplo del manual técnico v150
    const cdcSinDv = '0180069563100100100100000012024112901000000001'
    const dv = calcularDvCdc(cdcSinDv)
    expect(typeof dv).toBe('number')
    expect(dv).toBeGreaterThanOrEqual(0)
    expect(dv).toBeLessThanOrEqual(9)
  })
})

describe('generarCdc', () => {
  it('genera CDC de 44 caracteres', () => {
    const cdc = generarCdc({
      tipoDocumento: 1,
      rucEmisor: '80069563',
      establecimiento: '001',
      puntoExpedicion: '001',
      numero: 1,
      fecha: new Date('2024-11-29'),
    })
    expect(cdc).toHaveLength(44)
  })

  it('genera CDC que empieza con 01', () => {
    const cdc = generarCdc({
      tipoDocumento: 1,
      rucEmisor: '80069563',
      establecimiento: '001',
      puntoExpedicion: '001',
      numero: 1,
      fecha: new Date('2024-11-29'),
    })
    expect(cdc.startsWith('01')).toBe(true)
  })

  it('genera CDC solo con dígitos', () => {
    const cdc = generarCdc({
      tipoDocumento: 1,
      rucEmisor: '80069563',
      establecimiento: '001',
      puntoExpedicion: '001',
      numero: 1,
      fecha: new Date('2024-11-29'),
    })
    expect(/^\d+$/.test(cdc)).toBe(true)
  })

  it('incorpora código de seguridad provisto', () => {
    const seg = '123456789'
    const cdc = generarCdc({
      tipoDocumento: 1,
      rucEmisor: '80069563',
      establecimiento: '001',
      puntoExpedicion: '001',
      numero: 1,
      fecha: new Date('2024-11-29'),
      codigoSeguridad: seg,
    })
    // El código de seguridad ocupa posiciones 35-43 (0-indexed)
    expect(cdc.slice(34, 43)).toBe(seg)
  })

  it('dos CDCs con mismo origen pero diferente número son distintos', () => {
    const base = {
      tipoDocumento: 1 as const,
      rucEmisor: '80069563',
      establecimiento: '001',
      puntoExpedicion: '001',
      fecha: new Date('2024-11-29'),
      codigoSeguridad: '000000001',
    }
    const cdc1 = generarCdc({ ...base, numero: 1 })
    const cdc2 = generarCdc({ ...base, numero: 2 })
    expect(cdc1).not.toBe(cdc2)
  })
})

describe('validarCdc', () => {
  it('valida un CDC generado por generarCdc', () => {
    const cdc = generarCdc({
      tipoDocumento: 1,
      rucEmisor: '80069563',
      establecimiento: '001',
      puntoExpedicion: '001',
      numero: 1,
      fecha: new Date('2024-11-29'),
      codigoSeguridad: '000000001',
    })
    expect(validarCdc(cdc)).toBe(true)
  })

  it('rechaza CDC con longitud incorrecta', () => {
    expect(validarCdc('12345')).toBe(false)
  })

  it('rechaza CDC que no empieza con 01', () => {
    const valido = generarCdc({
      tipoDocumento: 1,
      rucEmisor: '80069563',
      establecimiento: '001',
      puntoExpedicion: '001',
      numero: 1,
      fecha: new Date('2024-11-29'),
      codigoSeguridad: '000000001',
    })
    // Reemplazar los primeros 2 chars
    const invalido = '99' + valido.slice(2)
    expect(validarCdc(invalido)).toBe(false)
  })

  it('rechaza CDC con DV modificado', () => {
    const cdc = generarCdc({
      tipoDocumento: 1,
      rucEmisor: '80069563',
      establecimiento: '001',
      puntoExpedicion: '001',
      numero: 1,
      fecha: new Date('2024-11-29'),
      codigoSeguridad: '000000001',
    })
    const dvOriginal = parseInt(cdc[43] ?? '0')
    const dvModificado = (dvOriginal + 1) % 10
    const cdcModificado = cdc.slice(0, 43) + dvModificado
    expect(validarCdc(cdcModificado)).toBe(false)
  })
})
