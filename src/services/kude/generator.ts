import puppeteer from 'puppeteer'
import { generarHtmlKude, type DatosKude } from './template.js'
import { XMLParser } from 'fast-xml-parser'
import { TIPO_DOCUMENTO, CONDICION_PAGO, AFEC_IVA } from '../../config/constants.js'
import { env } from '../../config/env.js'

export interface KudeGeneratorResult {
  pdf: Buffer
  html: string  // también disponible para previsualizaciones web
}

/**
 * Genera el PDF KuDE a partir del XML aprobado del DE.
 * Usa puppeteer con Chromium headless (incluido en el Dockerfile).
 *
 * Flujo:
 *  1. Parsear XML del DE para extraer datos
 *  2. Construir el objeto DatosKude
 *  3. Renderizar HTML con el template oficial
 *  4. Convertir a PDF A4 con puppeteer
 */
export async function generarKudePdf(xmlFirmado: string): Promise<KudeGeneratorResult> {
  const datos = extraerDatosDeXml(xmlFirmado)
  const html = generarHtmlKude(datos)
  const pdf = await renderizarPdf(html)
  return { pdf, html }
}

// ─── Extracción de datos del XML ──────────────────────────────────────────────

function extraerDatosDeXml(xml: string): DatosKude {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseAttributeValue: true,
    isArray: (name) => name === 'gCamItem',
  })

  const parsed = parser.parse(xml) as Record<string, unknown>
  const rDE = (parsed['rDE'] ?? parsed) as Record<string, unknown>
  const de = rDE['DE'] as Record<string, unknown>
  const gTimb = de['gTimb'] as Record<string, unknown>
  const gDatGralOpe = de['gDatGralOpe'] as Record<string, unknown>
  const gOpeCom = gDatGralOpe['gOpeCom'] as Record<string, unknown>
  const gEmis = gDatGralOpe['gEmis'] as Record<string, unknown>
  const gDatRec = gDatGralOpe['gDatRec'] as Record<string, unknown>
  const gDtipDE = de['gDtipDE'] as Record<string, unknown> | undefined
  const gTotSub = de['gTotSub'] as Record<string, unknown>
  const gCamFuFD = rDE['gCamFuFD'] as Record<string, unknown> | undefined

  const cdc = String((de['@_Id'] as string | undefined) ?? '')
  const iTiDE = Number(gTimb['iTiDE'])
  const moneda = String(gOpeCom['cMoneOpe'] ?? 'PYG')
  const iCondOpe = gDtipDE
    ? Number((gDtipDE['gCamCond'] as Record<string, unknown> | undefined)?.['iCondOpe'] ?? 1)
    : 1

  // Ítems
  const rawItems = (gDtipDE?.['gCamItem'] as Record<string, unknown>[]) ?? []
  const items = rawItems.map((item) => {
    const iAfecIVA = Number(item['gCamIVA']
      ? (item['gCamIVA'] as Record<string, unknown>)['iAfecIVA']
      : AFEC_IVA.GRAVADO)
    const tasaIva = Number(item['gCamIVA']
      ? (item['gCamIVA'] as Record<string, unknown>)['dTasaIVA'] ?? 10
      : 10)

    return {
      descripcion: String(item['dDesProSer'] ?? ''),
      cantidad: Number(item['dCantProSer'] ?? 1),
      unidadMedida: String(item['cUniMed'] ?? ''),
      precioUnitario: Number(item['dPUniProSer'] ?? 0),
      descuento: Number(item['dDescItem'] ?? 0),
      total: Number(item['dTotNeto'] ?? item['dTotBruOpeItem'] ?? 0),
      iva: iAfecIVA === AFEC_IVA.EXENTO
        ? 'Exento'
        : iAfecIVA === AFEC_IVA.EXONERADO
          ? 'Exonerado'
          : `IVA ${tasaIva}%`,
    }
  })

  return {
    // Emisor
    nombreEmisor: String(gEmis['dNomEmi'] ?? ''),
    rucEmisor: `${String(gEmis['dRucEm'] ?? '')}-${String(gEmis['dDVEmi'] ?? '')}`,
    direccionEmisor: String(gEmis['dDirEmi'] ?? ''),
    telefonoEmisor: gEmis['dTelEmi'] ? String(gEmis['dTelEmi']) : undefined,
    emailEmisor: gEmis['dEmailEmi'] ? String(gEmis['dEmailEmi']) : undefined,
    actividadEconomica: gEmis['cActEco'] ? String(gEmis['cActEco']) : undefined,

    // Tipo de documento
    tipoDocumento: tipoDocumentoLabel(iTiDE),

    // Timbrado
    timbrado: String(gTimb['dNumTim'] ?? ''),
    establecimiento: String(gTimb['dEst'] ?? ''),
    puntoExpedicion: String(gTimb['dPunExp'] ?? ''),
    numero: String(gTimb['dNumDoc'] ?? '').padStart(7, '0'),
    fechaInicio: String(gTimb['dFeIniT'] ?? ''),

    // Operación
    cdc,
    fechaEmision: String(gDatGralOpe['dFeEmiDE'] ?? ''),
    moneda,
    condicionPago: iCondOpe === CONDICION_PAGO.CREDITO ? 'Crédito' : 'Contado',

    // Receptor
    nombreReceptor: String(gDatRec['dNomRec'] ?? ''),
    rucReceptor: gDatRec['dNumIDRec'] ? String(gDatRec['dNumIDRec']) : undefined,
    emailReceptor: gDatRec['dEmailRec'] ? String(gDatRec['dEmailRec']) : undefined,

    // Ítems
    items,

    // Totales
    subtotal10: Number(gTotSub['dSub10'] ?? 0),
    subtotal5: Number(gTotSub['dSub5'] ?? 0),
    subtotalExento: Number(gTotSub['dSExe'] ?? 0),
    totalIva10: Number(gTotSub['dIVA10'] ?? 0),
    totalIva5: Number(gTotSub['dIVA5'] ?? 0),
    totalIva: Number(gTotSub['dTotIVA'] ?? 0),
    totalGeneral: Number(gTotSub['dTotGralOpe'] ?? 0),

    // QR
    urlQr: String(gCamFuFD?.['dCarQR'] ?? ''),
    ambiente: env.SIFEN_AMBIENTE === 'produccion' ? 'Producción' : 'Test',
  }
}

async function renderizarPdf(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env['PUPPETEER_EXECUTABLE_PATH'],
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  })

  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    })

    return Buffer.from(pdfBuffer)
  } finally {
    await browser.close()
  }
}

function tipoDocumentoLabel(iTiDE: number): string {
  switch (iTiDE) {
    case TIPO_DOCUMENTO.FACTURA: return 'Factura Electrónica'
    case TIPO_DOCUMENTO.FACTURA_EXPORTACION: return 'Factura Electrónica de Exportación'
    case TIPO_DOCUMENTO.FACTURA_IMPORTACION: return 'Factura Electrónica de Importación'
    case TIPO_DOCUMENTO.AUTOFACTURA: return 'Autofactura Electrónica'
    case TIPO_DOCUMENTO.NOTA_CREDITO: return 'Nota de Crédito Electrónica'
    case TIPO_DOCUMENTO.NOTA_DEBITO: return 'Nota de Débito Electrónica'
    case TIPO_DOCUMENTO.NOTA_REMISION: return 'Nota de Remisión Electrónica'
    case TIPO_DOCUMENTO.RETENCION: return 'Comprobante de Retención Electrónico'
    default: return 'Documento Electrónico'
  }
}
