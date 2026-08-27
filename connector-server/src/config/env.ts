import { z } from 'zod'

// ── Security hardening (see docs/superpowers/specs/2026-06-15-security-quick-wins-client-it-ai-coding.md) ──
const DEFAULT_DEV_JWT_SECRET = 'rois-dev-jwt-secret-2026'
const PROD_LIKE_ENVS = ['production', 'staging', 'uat', 'demo'] as const

const isProdLike = (appEnv: string): boolean =>
  (PROD_LIKE_ENVS as readonly string[]).includes(appEnv) || process.env.NODE_ENV === 'production'

const boolFromEnv = (def: boolean) =>
  z.preprocess((v) => (v === undefined ? def : v === 'true' || v === '1'), z.boolean())

const envSchema = z
  .object({
    APP_ENV: z
      .enum(['development', 'test', 'staging', 'uat', 'demo', 'production'])
      .default('development'),
    HOST: z.string().default('0.0.0.0'),
    PORT: z.coerce.number().default(3004),
    DATABASE_URL: z.string(),
    REDIS_URL: z.string().default('redis://localhost:6379'),
    BULLMQ_REDIS_URL: z.string().optional(),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    JWT_SECRET: z.string().default(DEFAULT_DEV_JWT_SECRET),
    METRICS_ENABLED: boolFromEnv(true),
    METRICS_TOKEN: z.string().optional(),
    EXTERNAL_BASE_URL: z.string().optional(),
    // Redis key namespace: each environment (dev/uat/sit/prod) gets its own
    // `<env>:*` prefix so multiple connector-server processes on the same
    // Redis don't compete for the same BullMQ queues / cache keys.
    // Default 'dev' is safe for local development. Production-like APP_ENV
    // refuses to start with default 'dev' or 'uat' — see superRefine below.
    REDIS_KEY_PREFIX: z
      .string()
      .regex(/^[a-z][a-z0-9_]*$/)
      .default('dev'),
  })
  .superRefine((val, ctx) => {
    if (!isProdLike(val.APP_ENV)) return
    if (!val.JWT_SECRET || val.JWT_SECRET.length < 32 || val.JWT_SECRET === DEFAULT_DEV_JWT_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_SECRET'],
        message: `JWT_SECRET must be a unique secret of at least 32 characters when APP_ENV is "${val.APP_ENV}" (or NODE_ENV=production). Refusing to start with a missing, short, or default secret.`,
      })
    }
    if (val.REDIS_KEY_PREFIX === 'dev') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['REDIS_KEY_PREFIX'],
        message: `REDIS_KEY_PREFIX must be set to a non-default value (e.g. 'prod') when APP_ENV is "${val.APP_ENV}". Refusing to start with default 'dev' prefix in a production-like deployment.`,
      })
    }
    if (val.REDIS_KEY_PREFIX === 'uat') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['REDIS_KEY_PREFIX'],
        message: `REDIS_KEY_PREFIX cannot be 'uat' when APP_ENV is "${val.APP_ENV}". Use 'prod' for production-like deployments; 'uat' is reserved for the UAT environment.`,
      })
    }
})

const parsedEnv = envSchema.parse(process.env)

export const env = {
  ...parsedEnv,
  BULLMQ_REDIS_URL: parsedEnv.BULLMQ_REDIS_URL ?? parsedEnv.REDIS_URL,
}
export type Env = typeof env

export const isProdLikeEnv = isProdLike(env.APP_ENV)
