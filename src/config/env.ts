import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().min(1).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),

  // SIFEN
  SIFEN_AMBIENTE: z.enum(['test', 'produccion']).default('test'),
  SIFEN_CERT_PATH: z.string().min(1),
  SIFEN_CERT_PASS: z.string().min(1),

  // Base de datos
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().url().default('redis://localhost:6379'),

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
