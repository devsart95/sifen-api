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

// z.discriminatedUnion requiere z.literal() único por opción — no z.union()
const conformidadBase = {
  cdc: z.string().length(44),
  motivo: z.string().min(5).max(500).optional(),
}

export const ConformidadSchema = z.object({ tipo: z.literal(TIPO_EVENTO.CONFORMIDAD), ...conformidadBase })
export const DisconformidadSchema = z.object({ tipo: z.literal(TIPO_EVENTO.DISCONFORMIDAD), ...conformidadBase })
export const DesconocimientoSchema = z.object({ tipo: z.literal(TIPO_EVENTO.DESCONOCIMIENTO), ...conformidadBase })
export const AcuseReciboSchema = z.object({ tipo: z.literal(TIPO_EVENTO.ACUSE_RECIBO), ...conformidadBase })
export const AjusteEventoSchema = z.object({ tipo: z.literal(TIPO_EVENTO.AJUSTE_EVENTO), ...conformidadBase })

export const EventoSchema = z.discriminatedUnion('tipo', [
  CancelacionSchema,
  InutilizacionSchema,
  ConformidadSchema,
  DisconformidadSchema,
  DesconocimientoSchema,
  AcuseReciboSchema,
  AjusteEventoSchema,
])

export type EventoInput = z.infer<typeof EventoSchema>
export type CancelacionInput = z.infer<typeof CancelacionSchema>
export type InutilizacionInput = z.infer<typeof InutilizacionSchema>
export type ConformidadInput = z.infer<typeof ConformidadSchema>
export type DisconformidadInput = z.infer<typeof DisconformidadSchema>
export type DesconocimientoInput = z.infer<typeof DesconocimientoSchema>
export type AcuseReciboInput = z.infer<typeof AcuseReciboSchema>
export type AjusteEventoInput = z.infer<typeof AjusteEventoSchema>
