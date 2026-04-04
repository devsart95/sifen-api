import { describe, it, expect } from 'vitest'
import { calcularIvaItem, calcularTotalesIva } from '../../../src/utils/iva.js'
import { AFEC_IVA } from '../../../src/config/constants.js'

describe('calcularIvaItem — casos edge faltantes', () => {
  it('calcula IVA para GRAVADO_PARCIAL igual que GRAVADO 10%', () => {
    const result = calcularIvaItem({
      precioUnitario: 110_000,
      cantidad: 1,
      afecIva: AFEC_IVA.GRAVADO_PARCIAL,
      tasaIva: 10,
    })
    expect(result.ivaItem).toBe(10_000)
    expect(result.montoItem).toBe(110_000)
  })

  it('calcula correctamente con cantidad mayor a 1', () => {
    const result = calcularIvaItem({
      precioUnitario: 110_000,
      cantidad: 3,
      afecIva: AFEC_IVA.GRAVADO,
      tasaIva: 10,
    })
    // Monto = 110000 * 3 = 330000, IVA = 330000 / 11 = 30000
    expect(result.montoItem).toBe(330_000)
    expect(result.ivaItem).toBe(30_000)
  })

  it('montoItem sin descuento = precioUnitario * cantidad', () => {
    const result = calcularIvaItem({
      precioUnitario: 50_000,
      cantidad: 4,
      afecIva: AFEC_IVA.EXENTO,
    })
    expect(result.montoItem).toBe(200_000)
  })
})

describe('calcularTotalesIva — casos edge faltantes', () => {
  it('consolida GRAVADO_PARCIAL en subtotal10', () => {
    const items = [
      {
        precioUnitario: 110_000,
        cantidad: 1,
        afecIva: AFEC_IVA.GRAVADO_PARCIAL,
        tasaIva: 10 as const,
      },
    ]
    const totales = calcularTotalesIva(items)
    expect(totales.subtotal10).toBe(110_000)
    expect(totales.iva10).toBe(10_000)
  })

  it('exonerado no se suma en subtotal10 ni subtotal5', () => {
    const items = [
      { precioUnitario: 100_000, cantidad: 1, afecIva: AFEC_IVA.EXONERADO },
    ]
    const totales = calcularTotalesIva(items)
    expect(totales.subtotal10).toBe(0)
    expect(totales.subtotal5).toBe(0)
    expect(totales.subtotalExonerado).toBe(100_000)
    expect(totales.totalIva).toBe(0)
  })

  it('totalBruto es la suma de todos los subtotales', () => {
    const items = [
      { precioUnitario: 110_000, cantidad: 1, afecIva: AFEC_IVA.GRAVADO, tasaIva: 10 as const },
      { precioUnitario: 50_000, cantidad: 1, afecIva: AFEC_IVA.EXENTO },
      { precioUnitario: 30_000, cantidad: 1, afecIva: AFEC_IVA.EXONERADO },
    ]
    const totales = calcularTotalesIva(items)
    expect(totales.totalBruto).toBe(190_000)
  })
})
