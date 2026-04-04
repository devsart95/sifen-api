import { describe, it, expect } from 'vitest'
import {
  formatearFechaCdc,
  formatearFechaQr,
  formatearFechaXml,
  formatearFechaCorta,
} from '../../../src/utils/date.js'

const FECHA_FIJA = new Date('2024-11-29T17:59:57.000Z')

describe('formatearFechaCdc', () => {
  it('formatea como YYYYMMDD', () => {
    expect(formatearFechaCdc(FECHA_FIJA)).toBe('20241129')
  })

  it('agrega ceros en mes y día de un solo dígito', () => {
    const fecha = new Date('2024-01-05T10:00:00.000Z')
    expect(formatearFechaCdc(fecha)).toBe('20240105')
  })
})

describe('formatearFechaQr', () => {
  it('formatea como "YYYY-MM-DD HH:mm:ss"', () => {
    expect(formatearFechaQr(FECHA_FIJA)).toBe('2024-11-29 17:59:57')
  })

  it('tiene exactamente 19 caracteres', () => {
    expect(formatearFechaQr(FECHA_FIJA)).toHaveLength(19)
  })

  it('contiene espacio en lugar de T', () => {
    expect(formatearFechaQr(FECHA_FIJA)).not.toContain('T')
  })
})

describe('formatearFechaXml', () => {
  it('formatea como ISO 8601 sin milisegundos', () => {
    expect(formatearFechaXml(FECHA_FIJA)).toBe('2024-11-29T17:59:57')
  })

  it('contiene T entre fecha y hora', () => {
    expect(formatearFechaXml(FECHA_FIJA)).toContain('T')
  })
})

describe('formatearFechaCorta', () => {
  it('formatea como YYYY-MM-DD', () => {
    expect(formatearFechaCorta(FECHA_FIJA)).toBe('2024-11-29')
  })

  it('tiene exactamente 10 caracteres', () => {
    expect(formatearFechaCorta(FECHA_FIJA)).toHaveLength(10)
  })
})
