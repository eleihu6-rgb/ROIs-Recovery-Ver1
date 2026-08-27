import { z } from 'zod'

// ── Security hardening (see docs/superpowers/specs/2026-06-15-security-quick-wins-client-it-ai-coding.md) ──
// Known dev-only JWT secret. Must never reach a production-like deployment.
const DEFAULT_DEV_JWT_SECRET = 'rois-dev-jwt-secret-2026'
const DEFAULT_DEV_INTERNAL_API_SECRET = 'rois-dev-internal-secret-2026'
// Environments where weak/default secrets and permissive defaults are forbidden.
const PROD_LIKE_ENVS = ['production', 'staging', 'uat', 'demo'] as const

// Treat APP_ENV (or a conventional NODE_ENV=production) as production-like.
const isProdLike = (appEnv: string): boolean =>
  (PROD_LIKE_ENVS as readonly string[]).includes(appEnv) || process.env.NODE_ENV === 'production'

// Parse "true"/"1" as true; anything else false. Falls back to `def` when unset.
const boolFromEnv = (def: boolean) =>
  z.preprocess(
    (v) => (v === undefined ? def : v === 'true' || v === '1'),
    z.boolean()
  )

const optionalNonBlankString = () =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().optional(),
  )

const envSchema = z
  .object({
    APP_ENV: z
      .enum(['development', 'test', 'staging', 'uat', 'demo', 'production'])
      .default('development'),
    HOST: z.string().default('0.0.0.0'),
    PORT: z.coerce.number().default(3000),
    DATABASE_URL: z.string(),
    REDIS_URL: z.string().default('redis://localhost:6379'),
    BULLMQ_REDIS_URL: z.string().optional(),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    JWT_SECRET: z.string().default(DEFAULT_DEV_JWT_SECRET),
    // Comma-separated CORS allowlist (replaces previous `origin: true` reflection).
    CORS_ORIGIN: z.string().default('http://localhost:5173,http://localhost:5566'),
    // Internal Prometheus metrics exposure controls.
    METRICS_ENABLED: boolFromEnv(true),
    METRICS_TOKEN: z.string().optional(),
    ENGINE_SERVER_URL: z.string().url().default('http://localhost:3103'),
    CONNECTOR_SERVER_URL: z.string().url().default('http://localhost:3104'),
    PBS_SERVER_URL: z.string().url().default('http://localhost:3002'),
    PBS_INTERNAL_API_SECRET: z.string().min(1).default(DEFAULT_DEV_INTERNAL_API_SECRET),
    ROSTER_PUBLISH_OUTBOUND_INTERVAL_MS: z.coerce.number().int().positive().default(300_000),
    ROSTER_PUBLISH_OUTBOUND_RETRY_COOLDOWN_MS: z.coerce.number().int().positive().default(3_600_000),
    ROSTER_SOFT_DELETE_RETENTION_MONTHS: z.coerce.number().int().positive().default(1),
    ROSTER_SOFT_DELETE_CLEANUP_BATCH_SIZE: z.coerce.number().int().positive().default(1000),
    ROSTER_SOFT_DELETE_CLEANUP_INTERVAL_MS: z.coerce.number().int().positive().default(604_800_000),
    SCHEDULER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(30_000),
    LIVE_SCHEMA: z.string().regex(/^[a-z][a-z0-9_]*$/).default('f8_dev_live'),
    SCENARIO_SCHEMA: z.string().regex(/^[a-z][a-z0-9_]*$/).default('f8_dev_scenario'),
    PBS_SCHEMA: z.string().default('f8_dev_pbs'),
    FILIALE: optionalNonBlankString(),
    // Scenario Gantt data source: 'gz' parses optimizer gz files; 'db' reads the
    // partition-backed scenario schema. Default 'db' (parity proven — DB↔gz tests +
    // Playwright); keep SCENARIO_GANTT_SOURCE=gz as the escape hatch.
    SCENARIO_GANTT_SOURCE: z.enum(['gz', 'db']).default('db'),
    // ── Azure SAML SSO ─────────────────────────────────────────────────────
    SSO_ENABLED: boolFromEnv(false),
    SSO_ENTITY_ID: optionalNonBlankString(),
    SSO_CALLBACK_URL: optionalNonBlankString(),
    SSO_IDP_ENTRY_POINT: optionalNonBlankString(),
    SSO_IDP_CERT: optionalNonBlankString(),
    SSO_PRIVATE_KEY: optionalNonBlankString(),
    SSO_PUBLIC_CERT: optionalNonBlankString(),
    SSO_REDIRECT_BASE: optionalNonBlankString(),
    SSO_EMAIL_ATTRS: optionalNonBlankString(),
    SSO_USERCODE_ATTRS: optionalNonBlankString(),
    // Redis key namespace: each environment (dev/uat/sit/prod) gets its own
    // `<env>:*` prefix so multiple live-server processes on the same Redis
    // don't compete for the same BullMQ queues / cache keys / locks.
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
    if (val.PBS_INTERNAL_API_SECRET === DEFAULT_DEV_INTERNAL_API_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['PBS_INTERNAL_API_SECRET'],
        message: `PBS_INTERNAL_API_SECRET must be set to a deployment-specific secret when APP_ENV is "${val.APP_ENV}" (or NODE_ENV=production).`,
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
    if (val.SSO_ENABLED) {
      for (const key of ['SSO_ENTITY_ID', 'SSO_CALLBACK_URL', 'SSO_IDP_ENTRY_POINT', 'SSO_IDP_CERT', 'SSO_REDIRECT_BASE'] as const) {
        if (!val[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when SSO_ENABLED=true.`,
          })
        }
      }
    }
})

const parsedEnv = envSchema.parse(process.env)

export const env = {
  ...parsedEnv,
  BULLMQ_REDIS_URL: parsedEnv.BULLMQ_REDIS_URL ?? parsedEnv.REDIS_URL,
}
export type Env = typeof env

// Re-exported so CORS/metrics guards share one definition of "production-like".
export const isProdLikeEnv = isProdLike(env.APP_ENV)
