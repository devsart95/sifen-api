import { z } from 'zod'
import {
  TIPO_DOCUMENTO,
  TIPO_EMISION,
  CONDICION_PAGO,
  AFEC_IVA,
  TIPO_IMPUESTO,
  IND_PRESENCIA,
  MONEDA,
} from '../config/constants.js'

// ─── Timbrado ────────────────────────────────────────────────────────────────

export const TimbradoSchema = z.object({
  numero: z.string().length(8).regex(/^\d+$/, 'Timbrado: 8 dígitos'),
  establecimiento: z.string().length(3).regex(/^\d+$/, 'Establecimiento: 3 dígitos'),
  puntoExpedicion: z.string().length(3).regex(/^\d+$/, 'Punto de expedición: 3 dígitos'),
  fechaInicio: z.coerce.date(),
})

// ─── Emisor ───────────────────────────────────────────────────────────────────

export const EmisorSchema = z.object({
  ruc: z.string().min(1).max(8).regex(/^\d+$/, 'RUC sin DV'),
  dvRuc: z.string().length(1).regex(/^[\dkK]$/),
  razonSocial: z.string().min(1).max(255),
  nombreFantasia: z.string().max(255).optional(),
  tipoContribuyente: z.union([z.literal(1), z.literal(2)]),  // 1=Física, 2=Jurídica
  direccion: z.string().min(1).max(255),
  numeroCasa: z.string().max(6).default('0'),
  departamento: z.number().int().min(1).max(17).optional(),
  distrito: z.number().int().optional(),
  ciudad: z.number().int().optional(),
  telefono: z.string().max(15).optional(),
  email: z.string().email().optional(),
  actividadEconomica: z.string().max(6).optional(),
})

// ─── Receptor ────────────────────────────────────────────────────────────────

export const ReceptorSchema = z.object({
  tipoDocumento: z.number().int().min(1).max(9),  // 1=RUC, 2=CI, 3=Pasaporte, etc.
  documento: z.string().min(1).max(20),
  dvDocumento: z.string().length(1).optional(),
  razonSocial: z.string().min(1).max(255),
  tipoContribuyente: z.union([z.literal(1), z.literal(2)]).optional(),
  pais: z.string().length(3).default('PRY'),
  tipoOperacion: z.number().int().min(1).max(4).optional(),
  direccion: z.string().max(255).optional(),
  telefono: z.string().max(15).optional(),
  email: z.string().email().optional(),
})

// ─── Ítem ─────────────────────────────────────────────────────────────────────

export const ItemSchema = z.object({
  codigo: z.string().max(20).optional(),
  descripcion: z.string().min(1).max(120),
  unidadMedida: z.number().int().min(1),  // código SET
  cantidad: z.number().positive(),
  precioUnitario: z.number().nonnegative(),
  descuento: z.number().nonnegative().default(0),
  anticipo: z.number().nonnegative().default(0),
  afecIva: z.nativeEnum(AFEC_IVA),
  tasaIva: z.union([z.literal(10), z.literal(5)]).optional(),
  ivaProporcional: z.number().nonnegative().optional(),
  lote: z.string().max(80).optional(),
  vencimiento: z.coerce.date().optional(),
  numeroSerie: z.string().max(10).optional(),
  numeroPedido: z.string().max(20).optional(),
  numeroSeguimiento: z.string().max(20).optional(),
})

// ─── Condición de pago ────────────────────────────────────────────────────────

export const PagoSchema = z.object({
  tipo: z.nativeEnum(CONDICION_PAGO),
  montoEntrega: z.number().nonnegative().optional(),
  cuotas: z
    .array(
      z.object({
        monto: z.number().positive(),
        vencimiento: z.coerce.date(),
      }),
    )
    .optional(),
  medioPago: z.number().int().min(1).max(99).optional(),  // código SET
  infoPago: z.string().max(500).optional(),
})

// ─── Documento Electrónico (cuerpo de request) ───────────────────────────────

export const EmitirDeSchema = z.object({
  tipoDocumento: z.nativeEnum(TIPO_DOCUMENTO),
  tipoEmision: z.nativeEnum(TIPO_EMISION).default(TIPO_EMISION.NORMAL),
  timbrado: TimbradoSchema,
  fechaEmision: z.coerce.date().default(() => new Date()),
  moneda: z.nativeEnum(MONEDA).default(MONEDA.PYG),
  tipoImpuesto: z.nativeEnum(TIPO_IMPUESTO).default(TIPO_IMPUESTO.IVA),

  // Solo para Facturas (tipo 1, 2, 3)
  indicadorPresencia: z.nativeEnum(IND_PRESENCIA).optional(),

  // Solo para NC/ND (tipo 5, 6) — referencia al DE original
  documentoAsociado: z
    .object({
      cdc: z.string().length(44).optional(),
      timbrado: z.string().length(8).optional(),
      establecimiento: z.string().length(3).optional(),
      puntoExpedicion: z.string().length(3).optional(),
      numero: z.string().length(7).optional(),
      tipoDocumento: z.number().int().optional(),
      fechaEmision: z.coerce.date().optional(),
      motivoEmision: z.number().int().min(1).optional(),
    })
    .optional(),

  emisor: EmisorSchema,
  receptor: ReceptorSchema,
  items: z.array(ItemSchema).min(1).max(500),
  pago: PagoSchema,
  observacion: z.string().max(500).optional(),
  numeroOrdenCompra: z.string().max(20).optional(),
  numeroOrdenVenta: z.string().max(20).optional(),
  numeroAsiento: z.string().max(20).optional(),
})

export type EmitirDeInput = z.infer<typeof EmitirDeSchema>
export type TimbradoInput = z.infer<typeof TimbradoSchema>
export type Item = z.infer<typeof ItemSchema>
export type Emisor = z.infer<typeof EmisorSchema>
export type Receptor = z.infer<typeof ReceptorSchema>
export type Pago = z.infer<typeof PagoSchema>
