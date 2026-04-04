import { z } from 'zod'
import { TIPO_EVENTO } from '../config/constants.js'

export const CancelacionSchema = z.object({
  tipo: z.literal(TIPO_EVENTO.CANCELACION),
  cdc: z.string().length(44),
  motivo: z.string().min(5).max(500),
})

export const InutilizacionSchema = z.object({
  tipo: z.literal(TIPO_EVENTO.INUTILIZACION),
  timbrado: z.string().length(8).regex(/^\d+$/),
  establecimiento: z.string().length(3).regex(/^\d+$/),
  puntoExpedicion: z.string().length(3).regex(/^\d+$/),
  tipoDocumento: z.number().int().min(1).max(9),
  numeroInicio: z.number().int().positive(),
  numeroFin: z.number().int().positive(),
  motivo: z.string().min(5).max(500),
})

export const ConformidadSchema = z.object({
  tipo: z.union([
    z.literal(TIPO_EVENTO.CONFORMIDAD),
    z.literal(TIPO_EVENTO.DISCONFORMIDAD),
    z.literal(TIPO_EVENTO.DESCONOCIMIENTO),
    z.literal(TIPO_EVENTO.ACUSE_RECIBO),
  ]),
  cdc: z.string().length(44),
  motivo: z.string().min(5).max(500).optional(),
})

export const EventoSchema = z.discriminatedUnion('tipo', [
  CancelacionSchema,
  InutilizacionSchema,
  ConformidadSchema,
])

export type EventoInput = z.infer<typeof EventoSchema>
export type CancelacionInput = z.infer<typeof CancelacionSchema>
export type InutilizacionInput = z.infer<typeof InutilizacionSchema>
