import { describe, it, expect } from 'vitest'
import { validarEstructuraXml, tieneFirmaXml } from '../../../src/services/xml/validator.js'

const XML_VALIDO_MINIMO = `<?xml version="1.0" encoding="UTF-8"?>
<rDE xmlns="http://ekuatia.set.gov.py/sifen/xsd">
  <dVerFor>150</dVerFor>
  <DE Id="01800695631001001010000001202411290100000000019">
    <dDVId>9</dDVId>
    <dFecFirma>2024-11-29T17:59:57</dFecFirma>
    <gOpeDE>
      <iTipEmi>1</iTipEmi>
      <dCodSeg>000000001</dCodSeg>
    </gOpeDE>
    <gTimb>
      <iTiDE>1</iTiDE>
      <dNumTim>12345678</dNumTim>
      <dEst>001</dEst>
      <dPunExp>001</dPunExp>
      <dNumDoc>0000001</dNumDoc>
      <dFeIniT>2024-01-01</dFeIniT>
    </gTimb>
    <gDatGralOpe>
      <dFeEmiDE>2024-11-29T17:59:57</dFeEmiDE>
      <gOpeCom>
        <iTipTra>1</iTipTra>
        <iTImp>1</iTImp>
        <cMoneOpe>PYG</cMoneOpe>
      </gOpeCom>
      <gEmis>
        <dRucEm>80069563</dRucEm>
      </gEmis>
      <gDatRec>
        <dNomRec>Cliente Test</dNomRec>
      </gDatRec>
    </gDatGralOpe>
    <gTotSub>
      <dTotGralOpe>110000</dTotGralOpe>
      <dTotIVA>10000</dTotIVA>
    </gTotSub>
  </DE>
  <gCamFuFD>
    <dCarQR>https://ekuatia.set.gov.py/consultas/qr?nVersion=150</dCarQR>
  </gCamFuFD>
</rDE>`

describe('validarEstructuraXml', () => {
  it('valida un XML mínimo correcto', () => {
    const resultado = validarEstructuraXml(XML_VALIDO_MINIMO)
    expect(resultado.valid).toBe(true)
    expect(resultado.errors).toHaveLength(0)
  })

  it('reporta error si falta <rDE>', () => {
    const resultado = validarEstructuraXml('<otroElemento/>')
    expect(resultado.valid).toBe(false)
    expect(resultado.errors).toContain('Falta elemento raíz <rDE>')
  })

  it('reporta error si dVerFor es incorrecto', () => {
    const xml = XML_VALIDO_MINIMO.replace('<dVerFor>150</dVerFor>', '<dVerFor>100</dVerFor>')
    const resultado = validarEstructuraXml(xml)
    expect(resultado.valid).toBe(false)
    expect(resultado.errors.some((e) => e.includes('dVerFor'))).toBe(true)
  })

  it('reporta error si el CDC tiene longitud incorrecta', () => {
    const xml = XML_VALIDO_MINIMO.replace(
      'Id="01800695631001001010000001202411290100000000019"',
      'Id="012345"',
    )
    const resultado = validarEstructuraXml(xml)
    expect(resultado.valid).toBe(false)
    expect(resultado.errors.some((e) => e.includes('44 caracteres'))).toBe(true)
  })

  it('reporta error si falta <gTimb>', () => {
    const xml = XML_VALIDO_MINIMO.replace(
      /<gTimb>[\s\S]*?<\/gTimb>/,
      '',
    )
    const resultado = validarEstructuraXml(xml)
    expect(resultado.valid).toBe(false)
    expect(resultado.errors.some((e) => e.includes('gTimb'))).toBe(true)
  })

  it('reporta error si falta <gTotSub>', () => {
    const xml = XML_VALIDO_MINIMO.replace(
      /<gTotSub>[\s\S]*?<\/gTotSub>/,
      '',
    )
    const resultado = validarEstructuraXml(xml)
    expect(resultado.valid).toBe(false)
    expect(resultado.errors.some((e) => e.includes('gTotSub'))).toBe(true)
  })

  it('reporta error si falta URL del QR', () => {
    const xml = XML_VALIDO_MINIMO.replace(
      /<gCamFuFD>[\s\S]*?<\/gCamFuFD>/,
      '',
    )
    const resultado = validarEstructuraXml(xml)
    expect(resultado.valid).toBe(false)
    expect(resultado.errors.some((e) => e.includes('QR'))).toBe(true)
  })

  it('reporta múltiples errores cuando hay varios problemas', () => {
    const resultado = validarEstructuraXml('<rDE><dVerFor>999</dVerFor></rDE>')
    expect(resultado.valid).toBe(false)
    expect(resultado.errors.length).toBeGreaterThan(1)
  })

  it('retorna invalid para XML malformado', () => {
    const resultado = validarEstructuraXml('esto no es xml <<<<')
    expect(resultado.valid).toBe(false)
  })
})

describe('tieneFirmaXml', () => {
  it('retorna false para XML sin firma', () => {
    expect(tieneFirmaXml(XML_VALIDO_MINIMO)).toBe(false)
  })

  it('retorna true para XML con firma', () => {
    const xmlConFirma = XML_VALIDO_MINIMO.replace(
      '</rDE>',
      '<ds:Signature><ds:SignatureValue>abc</ds:SignatureValue></ds:Signature></rDE>',
    )
    expect(tieneFirmaXml(xmlConFirma)).toBe(true)
  })
})
