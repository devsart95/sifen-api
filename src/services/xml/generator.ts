import { create } from 'xmlbuilder2'
import type { XMLBuilder } from 'xmlbuilder2/lib/interfaces.js'
import {
  SIFEN_NAMESPACE,
  VERSION_FORMATO,
  TIPO_DOCUMENTO,
  CONDICION_PAGO,
} from '../../config/constants.js'
import { formatearFechaXml, formatearFechaCorta } from '../../utils/date.js'
import { calcularTotalesIva, type ItemIva } from '../../utils/iva.js'
import { generarCdc } from './cdc.js'
import { construirUrlQr } from './qr.js'
import type { EmitirDeInput } from '../../schemas/de.schema.js'

export interface XmlGeneratorResult {
  xml: string
  cdc: string
  urlQr: string
}

/**
 * Genera el XML completo del Documento Electrónico según Manual Técnico SIFEN v150.
 * El XML resultante está listo para ser firmado con XMLDSig.
 *
 * Flujo:
 *  1. Calcular totales IVA
 *  2. Generar CDC
 *  3. Construir URL QR (sin DigestValue — se actualiza post-firma)
 *  4. Construir árbol XML con xmlbuilder2
 *  5. Serializar a string
 */
export interface CscOpts {
  idCsc?: string
  valorCsc?: string
}

export function generarXmlDe(input: EmitirDeInput, numero: number, cscOpts?: CscOpts): XmlGeneratorResult {
  const fechaEmision = input.fechaEmision ?? new Date()

  // 1. Calcular totales IVA
  const itemsIva: ItemIva[] = input.items.map((item) => ({
    precioUnitario: item.precioUnitario,
    cantidad: item.cantidad,
    descuento: item.descuento,
    afecIva: item.afecIva,
    tasaIva: item.tasaIva,
  }))
  const totales = calcularTotalesIva(itemsIva)

  // 2. Generar CDC
  const cdc = generarCdc({
    tipoDocumento: input.tipoDocumento,
    rucEmisor: input.emisor.ruc,
    establecimiento: input.timbrado.establecimiento,
    puntoExpedicion: input.timbrado.puntoExpedicion,
    numero,
    fecha: fechaEmision,
    tipoEmision: input.tipoEmision,
  })

  // 3. URL QR (sin DigestValue — se completa en xml/signer.ts post-firma)
  const urlQr = construirUrlQr({
    cdc,
    rucEmisor: input.emisor.ruc,
    dvEmisor: input.emisor.dvRuc,
    totalBruto: totales.totalBruto,
    totalIva: totales.totalIva,
    fechaEmision,
    cantidadItems: input.items.length,
    idCsc: cscOpts?.idCsc,
    valorCsc: cscOpts?.valorCsc,
  })

  // 4. Construir XML
  const root = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('rDE', { xmlns: SIFEN_NAMESPACE })

  // Versión del formato
  root.ele('dVerFor').txt(VERSION_FORMATO)

  // Elemento DE con Id = CDC
  const de = root.ele('DE', { Id: cdc })
  de.ele('dDVId').txt(String(cdc[43]))
  de.ele('dFecFirma').txt(formatearFechaXml(fechaEmision))

  // gOpeDE — operación
  const gOpeDE = de.ele('gOpeDE')
  gOpeDE.ele('iTipEmi').txt(String(input.tipoEmision))
  // Código de seguridad (posiciones 34-42 del CDC, 0-indexed)
  gOpeDE.ele('dCodSeg').txt(cdc.slice(34, 43))

  // gTimb — timbrado
  const gTimb = de.ele('gTimb')
  gTimb.ele('iTiDE').txt(String(input.tipoDocumento))
  gTimb.ele('dNumTim').txt(input.timbrado.numero)
  gTimb.ele('dEst').txt(input.timbrado.establecimiento)
  gTimb.ele('dPunExp').txt(input.timbrado.puntoExpedicion)
  // Número correlativo (posiciones 19-25 del CDC)
  gTimb.ele('dNumDoc').txt(cdc.slice(19, 26))
  gTimb.ele('dFeIniT').txt(formatearFechaCorta(input.timbrado.fechaInicio))

  // gDatGralOpe — datos generales de la operación
  const gDatGralOpe = de.ele('gDatGralOpe')
  gDatGralOpe.ele('dFeEmiDE').txt(formatearFechaXml(fechaEmision))

  const gOpeCom = gDatGralOpe.ele('gOpeCom')
  gOpeCom.ele('iTipTra').txt('1') // Ctx: tipo transacción — 1=B2B por defecto
  gOpeCom.ele('iTImp').txt(String(input.tipoImpuesto))
  gOpeCom.ele('cMoneOpe').txt(input.moneda)

  // Emisor
  construirNodoEmisor(gDatGralOpe, input)

  // Receptor
  construirNodoReceptor(gDatGralOpe, input)

  // gDtipDE — campos específicos por tipo de documento
  const gDtipDE = de.ele('gDtipDE')
  construirCamposEspecificos(gDtipDE, input)

  // gCamItem — ítems
  for (const item of input.items) {
    construirNodoItem(gDtipDE, item)
  }

  // gTotSub — totales IVA
  const gTotSub = de.ele('gTotSub')
  gTotSub.ele('dSub10').txt(String(totales.subtotal10))
  gTotSub.ele('dSub5').txt(String(totales.subtotal5))
  gTotSub.ele('dSExe').txt(String(totales.subtotalExento))
  gTotSub.ele('dSExo').txt(String(totales.subtotalExonerado))
  gTotSub.ele('dTotOpe').txt(String(totales.totalBruto))
  gTotSub.ele('dTotGralOpe').txt(String(totales.totalBruto))
  gTotSub.ele('dIVA10').txt(String(totales.iva10))
  gTotSub.ele('dIVA5').txt(String(totales.iva5))
  gTotSub.ele('dTotIVA').txt(String(totales.totalIva))

  // Documento asociado (NC, ND que referencian una factura)
  if (input.documentoAsociado) {
    construirDocumentoAsociado(de, input)
  }

  // gCamFuFD — URL del QR (pre-firma, sin DigestValue)
  const gCamFuFD = root.ele('gCamFuFD')
  gCamFuFD.ele('dCarQR').txt(urlQr)

  const xml = root.end({ prettyPrint: false })

  return { xml, cdc, urlQr }
}

// ─── Helpers internos ─────────────────────────────────────────────────────────

function construirNodoEmisor(parent: XMLBuilder, input: EmitirDeInput): void {
  const e = input.emisor
  const gEmis = parent.ele('gEmis')
  gEmis.ele('dRucEm').txt(e.ruc)
  gEmis.ele('dDVEmi').txt(e.dvRuc)
  gEmis.ele('iTiCo').txt(String(e.tipoContribuyente))
  gEmis.ele('dNomEmi').txt(e.razonSocial)
  if (e.nombreFantasia) gEmis.ele('dNomFanEmi').txt(e.nombreFantasia)
  gEmis.ele('dDirEmi').txt(e.direccion)
  gEmis.ele('dNumCas').txt(e.numeroCasa)
  if (e.departamento != null) gEmis.ele('cDepEmi').txt(String(e.departamento))
  if (e.distrito != null) gEmis.ele('cDisEmi').txt(String(e.distrito))
  if (e.ciudad != null) gEmis.ele('cCiuEmi').txt(String(e.ciudad))
  if (e.telefono) gEmis.ele('dTelEmi').txt(e.telefono)
  if (e.email) gEmis.ele('dEmailEmi').txt(e.email)
  if (e.actividadEconomica) gEmis.ele('cActEco').txt(e.actividadEconomica)
}

function construirNodoReceptor(parent: XMLBuilder, input: EmitirDeInput): void {
  const r = input.receptor
  const gDatRec = parent.ele('gDatRec')
  gDatRec.ele('iNatRec').txt(r.tipoContribuyente ? '1' : '2') // 1=Contribuyente, 2=No contribuyente
  gDatRec.ele('iTiOpe').txt(String(r.tipoOperacion ?? 1))
  gDatRec.ele('cPaisRec').txt(r.pais)
  if (r.tipoContribuyente) gDatRec.ele('iTiCo').txt(String(r.tipoContribuyente))
  gDatRec.ele('iTiDocRec').txt(String(r.tipoDocumento))
  gDatRec.ele('dNumIDRec').txt(r.documento)
  if (r.dvDocumento) gDatRec.ele('dDVRec').txt(r.dvDocumento)
  gDatRec.ele('dNomRec').txt(r.razonSocial)
  if (r.direccion) gDatRec.ele('dDirRec').txt(r.direccion)
  if (r.telefono) gDatRec.ele('dTelRec').txt(r.telefono)
  if (r.email) gDatRec.ele('dEmailRec').txt(r.email)
}

function construirCamposEspecificos(parent: XMLBuilder, input: EmitirDeInput): void {
  const { tipoDocumento } = input

  // Facturas (tipo 1, 2, 3)
  if (
    tipoDocumento === TIPO_DOCUMENTO.FACTURA ||
    tipoDocumento === TIPO_DOCUMENTO.FACTURA_EXPORTACION ||
    tipoDocumento === TIPO_DOCUMENTO.FACTURA_IMPORTACION
  ) {
    const gCamFE = parent.ele('gCamFE')
    if (input.indicadorPresencia != null) {
      gCamFE.ele('iIndPres').txt(String(input.indicadorPresencia))
    }
  }

  // Nota de Crédito (tipo 5)
  if (tipoDocumento === TIPO_DOCUMENTO.NOTA_CREDITO) {
    const gCamNCDE = parent.ele('gCamNCDE')
    gCamNCDE.ele('iMotEmi').txt(
      String(input.documentoAsociado?.motivoEmision ?? 1),
    )
  }

  // Nota de Débito (tipo 6) — motivo de emisión
  if (tipoDocumento === TIPO_DOCUMENTO.NOTA_DEBITO) {
    const gCamNDEDE = parent.ele('gCamNDEDE')
    gCamNDEDE.ele('iMotEmi').txt(
      String(input.documentoAsociado?.motivoEmision ?? 1),
    )
  }

  // Nota de Remisión (tipo 7)
  if (tipoDocumento === TIPO_DOCUMENTO.NOTA_REMISION) {
    const gCamNRE = parent.ele('gCamNRE')
    gCamNRE.ele('iMotEmiNR').txt(
      String(input.documentoAsociado?.motivoEmision ?? 1),
    )
  }

  // Condición de pago (todas las facturas y NC/ND)
  const gCamCond = parent.ele('gCamCond')
  gCamCond.ele('iCondOpe').txt(String(input.pago.tipo))

  if (input.pago.tipo === CONDICION_PAGO.CONTADO && input.pago.montoEntrega != null) {
    const gPaConEIni = gCamCond.ele('gPaConEIni')
    gPaConEIni.ele('iTiPago').txt(String(input.pago.medioPago ?? 1))
    gPaConEIni.ele('dMonTiPag').txt(String(input.pago.montoEntrega))
    gPaConEIni.ele('cMoneTiPag').txt(input.moneda)
  }

  if (input.pago.tipo === CONDICION_PAGO.CREDITO && input.pago.cuotas?.length) {
    for (const cuota of input.pago.cuotas) {
      const gPagCred = gCamCond.ele('gPagCred')
      gPagCred.ele('cMoneCuo').txt(input.moneda)
      gPagCred.ele('dDMonCuota').txt(String(cuota.monto))
      gPagCred.ele('dFecVencCuo').txt(formatearFechaCorta(cuota.vencimiento))
    }
  }

  // Campos opcionales del DE (observación, orden de compra, etc.)
  if (input.observacion) {
    parent.ele('dMotEmi').txt(input.observacion)
  }
}

function construirNodoItem(parent: XMLBuilder, item: EmitirDeInput['items'][number]): void {
  const gCamItem = parent.ele('gCamItem')
  if (item.codigo) gCamItem.ele('dCodInt').txt(item.codigo)
  gCamItem.ele('dDesProSer').txt(item.descripcion)
  gCamItem.ele('cUniMed').txt(String(item.unidadMedida))
  gCamItem.ele('dCantProSer').txt(String(item.cantidad))
  gCamItem.ele('dPUniProSer').txt(String(item.precioUnitario))
  if (item.descuento > 0) gCamItem.ele('dDescItem').txt(String(item.descuento))
  if (item.anticipo > 0) gCamItem.ele('dAntPreUniIt').txt(String(item.anticipo))
  gCamItem.ele('dTotBruOpeItem').txt(
    String(item.precioUnitario * item.cantidad),
  )
  gCamItem.ele('dTotNeto').txt(
    String(item.precioUnitario * item.cantidad - item.descuento),
  )

  // IVA del ítem
  const gCamIVA = gCamItem.ele('gCamIVA')
  gCamIVA.ele('iAfecIVA').txt(String(item.afecIva))
  if (item.tasaIva != null) gCamIVA.ele('dTasaIVA').txt(String(item.tasaIva))

  // Lote y vencimiento (si aplica)
  if (item.lote) gCamItem.ele('dLote').txt(item.lote)
  if (item.vencimiento) gCamItem.ele('dVencMerc').txt(formatearFechaCorta(item.vencimiento))
  if (item.numeroSerie) gCamItem.ele('dNumSerie').txt(item.numeroSerie)
}

function construirDocumentoAsociado(parent: XMLBuilder, input: EmitirDeInput): void {
  const da = input.documentoAsociado
  if (!da) return

  const gCamDEAsoc = parent.ele('gCamDEAsoc')
  // Tipo 1 = Electrónico (referenciado por CDC), Tipo 2 = Impreso (por timbrado+número)
  const tipoDocAso = da.cdc ? 1 : 2
  gCamDEAsoc.ele('iTipDocAso').txt(String(tipoDocAso))

  if (tipoDocAso === 1 && da.cdc) {
    gCamDEAsoc.ele('dCdCDERef').txt(da.cdc)
  } else {
    if (da.timbrado) gCamDEAsoc.ele('dNTimDI').txt(da.timbrado)
    if (da.establecimiento) gCamDEAsoc.ele('dEstDI').txt(da.establecimiento)
    if (da.puntoExpedicion) gCamDEAsoc.ele('dPExpDI').txt(da.puntoExpedicion)
    if (da.numero) gCamDEAsoc.ele('dNumDI').txt(String(da.numero))
    if (da.tipoDocumento != null) gCamDEAsoc.ele('dTipDocAso').txt(String(da.tipoDocumento))
    if (da.fechaEmision) gCamDEAsoc.ele('dFecEmiDI').txt(formatearFechaCorta(da.fechaEmision))
  }
}
