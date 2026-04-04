// Namespace oficial SIFEN
export const SIFEN_NAMESPACE = 'http://ekuatia.set.gov.py/sifen/xsd'
export const XMLDSIG_NAMESPACE = 'http://www.w3.org/2000/09/xmldsig#'
export const SOAP_NAMESPACE = 'http://www.w3.org/2003/05/soap-envelope'

// Versión del formato
export const VERSION_FORMATO = '150' as const

// Portal QR
export const QR_BASE_URL = 'https://ekuatia.set.gov.py/consultas/qr'

// Endpoints SIFEN por ambiente
export const SIFEN_ENDPOINTS = {
  test: {
    base: 'https://sifen-test.set.gov.py',
    recepcion: '/de/ws/sync/recibe.wsdl',
    recepcionLote: '/de/ws/async/recibe-lote.wsdl',
    consultaCdc: '/de/ws/consultas/consulta.wsdl',
    consultaLote: '/de/ws/consultas/consulta-lote.wsdl',
    consultaRuc: '/consultas/ruc.wsdl',
    eventos: '/de/ws/eventos/recibe-evento.wsdl',
    consultaDte: '/de/ws/consultas/consulta-dte.wsdl',
  },
  produccion: {
    base: 'https://sifen.set.gov.py',
    recepcion: '/de/ws/sync/recibe.wsdl',
    recepcionLote: '/de/ws/async/recibe-lote.wsdl',
    consultaCdc: '/de/ws/consultas/consulta.wsdl',
    consultaLote: '/de/ws/consultas/consulta-lote.wsdl',
    consultaRuc: '/consultas/ruc.wsdl',
    eventos: '/de/ws/eventos/recibe-evento.wsdl',
    consultaDte: '/de/ws/consultas/consulta-dte.wsdl',
  },
} as const

// Tipos de Documento Electrónico (iTiDE)
export const TIPO_DOCUMENTO = {
  FACTURA: 1,
  FACTURA_EXPORTACION: 2,
  FACTURA_IMPORTACION: 3,
  AUTOFACTURA: 4,
  NOTA_CREDITO: 5,
  NOTA_DEBITO: 6,
  NOTA_REMISION: 7,
  RETENCION: 8,
  BOLETA_VENTA: 9,
} as const

// Tipos de emisión
export const TIPO_EMISION = {
  NORMAL: 1,
  CONTINGENCIA: 2,
} as const

// Tipos de IVA por ítem (iAfecIVA)
export const AFEC_IVA = {
  GRAVADO: 1,
  EXONERADO: 2,
  EXENTO: 3,
  GRAVADO_PARCIAL: 4,
} as const

// Tasas de IVA
export const TASA_IVA = {
  DIEZ: 10,
  CINCO: 5,
} as const

// Tipos de impuesto de operación (iTImp)
export const TIPO_IMPUESTO = {
  IVA: 1,
  ISC: 2,
  RENTA: 3,
  NINGUNO: 4,
  IVA_ISC: 5,
} as const

// Condición de pago
export const CONDICION_PAGO = {
  CONTADO: 1,
  CREDITO: 2,
} as const

// Indicador de presencia (iIndPres) — solo Facturas
export const IND_PRESENCIA = {
  OPERACION_PRESENCIAL: 1,
  OPERACION_DISTANCIA: 2,
  CYBERMONDAY: 3,
  INMOBILIARIA: 4,
  OTRO: 9,
} as const

// Tipos de evento
export const TIPO_EVENTO = {
  CANCELACION: 1,
  INUTILIZACION: 2,
  ENDOSO: 3,
  ACUSE_RECIBO: 10,
  CONFORMIDAD: 11,
  DISCONFORMIDAD: 12,
  DESCONOCIMIENTO: 13,
} as const

// Monedas soportadas
export const MONEDA = {
  PYG: 'PYG',
  USD: 'USD',
  EUR: 'EUR',
  BRL: 'BRL',
  ARS: 'ARS',
} as const

// Límites SIFEN
export const LIMITES = {
  MAX_DES_POR_LOTE: 50,
  MAX_ITEMS_POR_DE: 500,
  TIMEOUT_SOAP_MS: 30_000,
  REINTENTOS_LOTE: 3,
} as const
