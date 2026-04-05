import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().min(1).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),

  // SIFEN
  SIFEN_AMBIENTE: z.enum(['test', 'produccion']).default('test'),
  // Cert global (backward compat). Opcional si cada tenant tiene su propio cert en DB.
  SIFEN_CERT_PATH: z.string().optional(),
  SIFEN_CERT_PASS: z.string().optional(),

  // Storage provider para KuDE PDFs
  STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./storage/kude'),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  // Métricas Prometheus
  METRICS_ENABLED: z.coerce.boolean().default(false),

  // Base de datos
  DATABASE_URL: z.string().url(),

  // Redis — opcional: solo requerido para lotes asíncronos y webhooks encolados
  REDIS_URL: z.string().url().optional(),

  // Seguridad
  API_KEY_SECRET: z.string().min(32),

  // Rate limiting
  RATE_LIMIT_MAX: z.coerce.number().positive().default(100),
  RATE_LIMIT_WINDOW: z.string().default('1 minute'),
})

const _env = envSchema.safeParse(process.env)

if (!_env.success) {
  console.error('❌ Variables de entorno inválidas:')
  console.error(_env.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = _env.data
export type Env = typeof env
