/**
 * Payloads de ejemplo para tests de integración.
 * Usan datos válidos estructuralmente pero no requieren SIFEN real.
 */
import { AFEC_IVA, CONDICION_PAGO, IND_PRESENCIA, TIPO_DOCUMENTO, TIPO_EMISION } from '../../../src/config/constants.js'

export const PAYLOAD_FACTURA_MINIMA = {
  tipoDocumento: TIPO_DOCUMENTO.FACTURA,
  tipoEmision: TIPO_EMISION.NORMAL,
  indicadorPresencia: IND_PRESENCIA.OPERACION_PRESENCIAL,
  timbrado: {
    numero: '12345678',
    establecimiento: '001',
    puntoExpedicion: '001',
    fechaInicio: '2024-01-01',
  },
  emisor: {
    ruc: '80069563',
    dvRuc: '1',
    razonSocial: 'EMPRESA TEST SA',
    tipoContribuyente: 2,
    direccion: 'Av. Mcal. López 2790',
    numeroCasa: '2790',
    departamento: 11,
    ciudad: 1,
  },
  receptor: {
    tipoDocumento: 1,
    documento: '12345678',
    dvDocumento: '9',
    razonSocial: 'CLIENTE TEST SA',
    tipoContribuyente: 2,
    pais: 'PRY',
  },
  items: [
    {
      descripcion: 'Producto de prueba',
      unidadMedida: 77,
      cantidad: 1,
      precioUnitario: 110000,
      descuento: 0,
      anticipo: 0,
      afecIva: AFEC_IVA.GRAVADO,
      tasaIva: 10,
    },
  ],
  pago: {
    tipo: CONDICION_PAGO.CONTADO,
    montoEntrega: 110000,
    medioPago: 1,
  },
}

export const PAYLOAD_CANCELACION = (cdc: string) => ({
  tipo: 1,
  cdc,
  motivo: 'Error en datos del receptor — test de integración',
})

export const PAYLOAD_INUTILIZACION = {
  tipo: 2,
  timbrado: '12345678',
  establecimiento: '001',
  puntoExpedicion: '001',
  tipoDocumento: 1,
  numeroInicio: 1,
  numeroFin: 5,
  motivo: 'Numeración inutilizada por pruebas — test de integración',
}
