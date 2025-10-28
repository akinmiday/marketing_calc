import { config } from 'dotenv'
import { z } from 'zod'

config()

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development','test','production']).default('development'),
  PORT: z.coerce.number().default(4000),
  CORS_ORIGINS: z.string().optional().default(''),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  JWT_EXPIRES_IN: z.string().default('7d'),
  RESET_TOKEN_EXPIRY_MINUTES: z.coerce.number().default(60),
})

const parsed = EnvSchema.safeParse(process.env)
if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors)
  process.exit(1)
}

const rawOrigins = parsed.data.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
export const env = {
  ...parsed.data,
  CORS_ARRAY: rawOrigins
}
