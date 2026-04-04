import { describe, it, expect } from 'vitest'
import { calcularIvaItem, calcularTotalesIva } from '../../../src/utils/iva.js'
import { AFEC_IVA } from '../../../src/config/constants.js'

describe('calcularIvaItem', () => {
  it('calcula IVA 10% incluido correctamente', () => {
    const result = calcularIvaItem({
      precioUnitario: 110_000,
      cantidad: 1,
      afecIva: AFEC_IVA.GRAVADO,
      tasaIva: 10,
    })
    // IVA = 110000 / 11 = 10000
    expect(result.montoItem).toBe(110_000)
    expect(result.ivaItem).toBe(10_000)
    expect(result.baseImponible).toBe(100_000)
  })

  it('calcula IVA 5% incluido correctamente', () => {
    const result = calcularIvaItem({
      precioUnitario: 210_000,
      cantidad: 1,
      afecIva: AFEC_IVA.GRAVADO,
      tasaIva: 5,
    })
    // IVA = 210000 / 21 = 10000
    expect(result.montoItem).toBe(210_000)
    expect(result.ivaItem).toBe(10_000)
    expect(result.baseImponible).toBe(200_000)
  })

  it('retorna IVA 0 para ítems exentos', () => {
    const result = calcularIvaItem({
      precioUnitario: 50_000,
      cantidad: 2,
      afecIva: AFEC_IVA.EXENTO,
    })
    expect(result.montoItem).toBe(100_000)
    expect(result.ivaItem).toBe(0)
    expect(result.baseImponible).toBe(100_000)
  })

  it('retorna IVA 0 para ítems exonerados', () => {
    const result = calcularIvaItem({
      precioUnitario: 50_000,
      cantidad: 1,
      afecIva: AFEC_IVA.EXONERADO,
    })
    expect(result.ivaItem).toBe(0)
  })

  it('aplica descuento antes de calcular IVA', () => {
    const result = calcularIvaItem({
      precioUnitario: 110_000,
      cantidad: 1,
      descuento: 11_000,
      afecIva: AFEC_IVA.GRAVADO,
      tasaIva: 10,
    })
    // Monto = 110000 - 11000 = 99000
    // IVA = 99000 / 11 = 9000
    expect(result.montoItem).toBe(99_000)
    expect(result.ivaItem).toBe(9_000)
  })

  it('usa IVA 10% como tasa por defecto', () => {
    const result = calcularIvaItem({
      precioUnitario: 110_000,
      cantidad: 1,
      afecIva: AFEC_IVA.GRAVADO,
      // tasaIva no especificado → debe usar 10%
    })
    expect(result.ivaItem).toBe(10_000)
  })
})

describe('calcularTotalesIva', () => {
  it('consolida totales con ítems mixtos', () => {
    const items = [
      { precioUnitario: 110_000, cantidad: 1, afecIva: AFEC_IVA.GRAVADO, tasaIva: 10 as const },
      { precioUnitario: 210_000, cantidad: 1, afecIva: AFEC_IVA.GRAVADO, tasaIva: 5 as const },
      { precioUnitario: 50_000, cantidad: 1, afecIva: AFEC_IVA.EXENTO },
    ]

    const totales = calcularTotalesIva(items)

    expect(totales.subtotal10).toBe(110_000)
    expect(totales.subtotal5).toBe(210_000)
    expect(totales.subtotalExento).toBe(50_000)
    expect(totales.iva10).toBe(10_000)
    expect(totales.iva5).toBe(10_000)
    expect(totales.totalIva).toBe(20_000)
    expect(totales.totalBruto).toBe(370_000)
  })

  it('retorna ceros con lista vacía', () => {
    const totales = calcularTotalesIva([])
    expect(totales.totalIva).toBe(0)
    expect(totales.totalBruto).toBe(0)
  })
})
