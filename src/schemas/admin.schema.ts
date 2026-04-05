import { z } from 'zod'

// ─── Tenants ──────────────────────────────────────────────────────────────────

export const CrearTenantSchema = z.object({
  nombre: z.string().min(1).max(255),
  ruc: z.string().regex(/^\d{1,8}$/, 'RUC sin dígito verificador'),
  dvRuc: z.string().length(1).regex(/^\d$/, 'DV debe ser un dígito'),
  rateLimitMax: z.number().int().positive().optional(),
  idCsc: z.string().min(1).max(10).optional(), // Identificador del CSC (ej: "0001")
  csc: z.string().min(1).optional(),           // Código de Seguridad del Contribuyente (DNIT)
})

export const ActualizarTenantSchema = z.object({
  nombre: z.string().min(1).max(255).optional(),
  activo: z.boolean().optional(),
  rateLimitMax: z.number().int().positive().nullable().optional(),
  webhookUrl: z.string().url().nullable().optional(),
  webhookSecret: z.string().length(64).nullable().optional(), // hex 32 bytes
  webhookActivo: z.boolean().optional(),
  idCsc: z.string().min(1).max(10).nullable().optional(),
  csc: z.string().min(1).nullable().optional(),
})

// ─── API Keys ─────────────────────────────────────────────────────────────────

export const CrearApiKeySchema = z.object({
  nombre: z.string().min(1).max(100),
  isAdmin: z.boolean().default(false),
})

// ─── Timbrados ────────────────────────────────────────────────────────────────

export const CrearTimbradoSchema = z.object({
  numero: z.string().min(1),
  establecimiento: z.string().length(3),
  puntoExpedicion: z.string().length(3),
  tipoDocumento: z.number().int().min(1).max(8),
  fechaInicio: z.coerce.date(),
  fechaFin: z.coerce.date().optional(),
})

export const ActualizarTimbradoSchema = z.object({
  activo: z.boolean().optional(),
  fechaFin: z.coerce.date().nullable().optional(),
})

// ─── Certificado ──────────────────────────────────────────────────────────────

export const SubirCertSchema = z.object({
  p12Base64: z.string().min(1),
  passphrase: z.string().min(1),
})

export type CrearTenantInput = z.infer<typeof CrearTenantSchema>
export type ActualizarTenantInput = z.infer<typeof ActualizarTenantSchema>
export type CrearApiKeyInput = z.infer<typeof CrearApiKeySchema>
export type CrearTimbradoInput = z.infer<typeof CrearTimbradoSchema>
export type ActualizarTimbradoInput = z.infer<typeof ActualizarTimbradoSchema>
export type SubirCertInput = z.infer<typeof SubirCertSchema>
