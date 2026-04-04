import { describe, it, expect } from 'vitest'
import { construirUrlQr } from '../../../src/services/xml/qr.js'
import { generarCdc } from '../../../src/services/xml/cdc.js'
import { QR_BASE_URL } from '../../../src/config/constants.js'

const CDC_PRUEBA = generarCdc({
  tipoDocumento: 1,
  rucEmisor: '80069563',
  establecimiento: '001',
  puntoExpedicion: '001',
  numero: 1,
  fecha: new Date('2024-11-29'),
  codigoSeguridad: '000000001',
})

describe('construirUrlQr', () => {
  it('retorna URL que empieza con la base correcta', () => {
    const url = construirUrlQr({
      cdc: CDC_PRUEBA,
      rucEmisor: '80069563',
      dvEmisor: '1',
      totalBruto: 110_000,
      totalIva: 10_000,
      fechaEmision: new Date('2024-11-29T17:59:57.000Z'),
      cantidadItems: 2,
    })
    expect(url.startsWith(QR_BASE_URL)).toBe(true)
  })

  it('incluye nVersion=150', () => {
    const url = construirUrlQr({
      cdc: CDC_PRUEBA,
      rucEmisor: '80069563',
      dvEmisor: '1',
      totalBruto: 110_000,
      totalIva: 10_000,
      fechaEmision: new Date('2024-11-29'),
      cantidadItems: 1,
    })
    expect(url).toContain('nVersion=150')
  })

  it('incluye el CDC en el parámetro Id', () => {
    const url = construirUrlQr({
      cdc: CDC_PRUEBA,
      rucEmisor: '80069563',
      dvEmisor: '1',
      totalBruto: 110_000,
      totalIva: 10_000,
      fechaEmision: new Date('2024-11-29'),
      cantidadItems: 1,
    })
    expect(url).toContain(`Id=${CDC_PRUEBA}`)
  })

  it('incluye cItems con el número de ítems (NO el DV del CDC)', () => {
    const url = construirUrlQr({
      cdc: CDC_PRUEBA,
      rucEmisor: '80069563',
      dvEmisor: '1',
      totalBruto: 110_000,
      totalIva: 10_000,
      fechaEmision: new Date('2024-11-29'),
      cantidadItems: 5,
    })
    expect(url).toContain('cItems=5')
  })

  it('incluye DigestValue si se provee', () => {
    const url = construirUrlQr({
      cdc: CDC_PRUEBA,
      rucEmisor: '80069563',
      dvEmisor: '1',
      totalBruto: 110_000,
      totalIva: 10_000,
      fechaEmision: new Date('2024-11-29'),
      cantidadItems: 1,
      digestValue: 'abc123digest',
    })
    expect(url).toContain('DigestValue=abc123digest')
  })

  it('NO incluye DigestValue si no se provee', () => {
    const url = construirUrlQr({
      cdc: CDC_PRUEBA,
      rucEmisor: '80069563',
      dvEmisor: '1',
      totalBruto: 110_000,
      totalIva: 10_000,
      fechaEmision: new Date('2024-11-29'),
      cantidadItems: 1,
    })
    expect(url).not.toContain('DigestValue')
  })

  it('usa RUC+DV en formato "numero-dv" para dRucRec', () => {
    const url = construirUrlQr({
      cdc: CDC_PRUEBA,
      rucEmisor: '80069563',
      dvEmisor: '1',
      totalBruto: 110_000,
      totalIva: 10_000,
      fechaEmision: new Date('2024-11-29'),
      cantidadItems: 1,
    })
    expect(url).toContain('dRucRec=80069563-1')
  })
})
