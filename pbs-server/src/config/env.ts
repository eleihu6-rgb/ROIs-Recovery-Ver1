import { z } from "zod";

// ── Security hardening (see docs/superpowers/specs/2026-06-15-security-quick-wins-client-it-ai-coding.md) ──
const DEFAULT_DEV_JWT_SECRET = "rois-dev-jwt-secret-2026";
const DEFAULT_DEV_INTERNAL_API_SECRET = "rois-dev-internal-secret-2026";
const PROD_LIKE_ENVS = ["production", "staging", "uat", "demo"] as const;

const isProdLike = (appEnv: string): boolean =>
  (PROD_LIKE_ENVS as readonly string[]).includes(appEnv) || process.env.NODE_ENV === "production";

const boolFromEnv = (def: boolean) =>
  z.preprocess((v) => (v === undefined ? def : v === "true" || v === "1"), z.boolean());

const envSchema = z
  .object({
    APP_ENV: z
      .enum(["development", "test", "staging", "uat", "demo", "production"])
      .default("development"),
    HOST: z.string().default("0.0.0.0"),
    PORT: z.coerce.number().int().positive().default(3002),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
    CORS_ORIGIN: z.string().default("http://localhost:3030"),
    METRICS_ENABLED: boolFromEnv(true),
    METRICS_TOKEN: z.string().optional(),
    DATABASE_URL: z.string().min(1),
    DATABASE_CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
    REDIS_PBS_URL: z.string().min(1).default("redis://localhost:6380"),
    LIVE_SCHEMA: z.string().min(1).default("f8_sit_live"),
    PBS_SCHEMA: z.string().min(1).default("f8_sit_pbs"),
    JWT_SECRET: z.string().min(1).default(DEFAULT_DEV_JWT_SECRET),
    JWT_EXPIRES_IN: z.string().min(1).default("24h"),
    PBS_INTERNAL_API_SECRET: z.string().min(1).default(DEFAULT_DEV_INTERNAL_API_SECRET),
    RUST_RULE_CORE: z.string().optional(),
    PBS_AUTH_RSA_PRIVATE_KEY: z.string().optional(),
    PBS_AUTH_RSA_KEY_ID: z.string().optional(),
    SSO_ENABLED: boolFromEnv(false),
    SSO_ENTITY_ID: z.string().optional(),
    SSO_CALLBACK_URL: z.string().optional(),
    SSO_IDP_ENTRY_POINT: z.string().optional(),
    SSO_IDP_CERT: z.string().optional(),
    SSO_PRIVATE_KEY: z.string().optional(),
    SSO_PUBLIC_CERT: z.string().optional(),
    SSO_REDIRECT_BASE: z.string().optional(),
    SSO_EMAIL_ATTRS: z.string().optional(),
    SSO_USERCODE_ATTRS: z.string().optional(),
    // Redis key namespace: each environment (dev/uat/sit/prod) gets its own
    // `<env>:*` prefix so multiple pbs-server processes on the same Redis
    // don't compete for the same cache keys.
    // Default 'dev' is safe for local development. Production-like APP_ENV
    // refuses to start with default 'dev' or 'uat' — see superRefine below.
    REDIS_KEY_PREFIX: z
      .string()
      .regex(/^[a-z][a-z0-9_]*$/)
      .default("dev"),
  })
  .superRefine((val, ctx) => {
    if (!isProdLike(val.APP_ENV)) return;
    if (!val.JWT_SECRET || val.JWT_SECRET.length < 32 || val.JWT_SECRET === DEFAULT_DEV_JWT_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["JWT_SECRET"],
        message: `JWT_SECRET must be a unique secret of at least 32 characters when APP_ENV is "${val.APP_ENV}" (or NODE_ENV=production). Refusing to start with a missing, short, or default secret.`,
      });
    }
    if (val.REDIS_KEY_PREFIX === "dev") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["REDIS_KEY_PREFIX"],
        message: `REDIS_KEY_PREFIX must be set to a non-default value (e.g. "prod") when APP_ENV is "${val.APP_ENV}". Refusing to start with default "dev" prefix in a production-like deployment.`,
      });
    }
    if (val.REDIS_KEY_PREFIX === "uat") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["REDIS_KEY_PREFIX"],
        message: `REDIS_KEY_PREFIX cannot be "uat" when APP_ENV is "${val.APP_ENV}". Use "prod" for production-like deployments; "uat" is reserved for the UAT environment.`,
      });
    }
    if (val.PBS_INTERNAL_API_SECRET === DEFAULT_DEV_INTERNAL_API_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["PBS_INTERNAL_API_SECRET"],
        message: `PBS_INTERNAL_API_SECRET must be set to a deployment-specific secret when APP_ENV is "${val.APP_ENV}" (or NODE_ENV=production).`,
      });
    }
    if (!val.PBS_AUTH_RSA_PRIVATE_KEY?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["PBS_AUTH_RSA_PRIVATE_KEY"],
        message: `PBS_AUTH_RSA_PRIVATE_KEY is required when APP_ENV is "${val.APP_ENV}" (or NODE_ENV=production).`,
      });
    }
    if (!val.PBS_AUTH_RSA_KEY_ID?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["PBS_AUTH_RSA_KEY_ID"],
        message: `PBS_AUTH_RSA_KEY_ID is required when APP_ENV is "${val.APP_ENV}" (or NODE_ENV=production).`,
      });
    }
    if (val.SSO_ENABLED) {
      for (const key of ["SSO_ENTITY_ID", "SSO_CALLBACK_URL", "SSO_IDP_ENTRY_POINT", "SSO_IDP_CERT", "SSO_REDIRECT_BASE"] as const) {
        if (!val[key]?.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when SSO_ENABLED=true.`,
          });
        }
      }
    }
  });

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;

export const isProdLikeEnv = isProdLike(env.APP_ENV);
